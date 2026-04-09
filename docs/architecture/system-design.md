# rewrite 架构设计（当前实现）

> 更新时间：2026-04-09  
> 文档定位：记录当前已落地的架构事实与核心设计模块  
> 说明：规划与路线图见 `docs/roadmap/master-roadmap.md`，本文件只描述“现在系统是怎么工作的”

## 1. 系统目标与边界

`rewrite` 是一个精简版 AI Coding CLI，目标是超越claudecode，打造最强coding cli：

1. 用户输入提示词
2. 模型流式返回文本/思考/工具调用
3. 本地执行工具并回传结果
4. 继续多轮直到得到最终答案

当前边界：
- 已实现：CLI、REPL、查询循环、基础工具系统、基础权限确认、基础 UI 与状态管理
- 未实现：多 Provider、Agent/Task 编排、MCP/插件集成、长会话压缩治理

## 2. 顶层架构视图

当前目录（核心）：

```text
src/
├── entrypoint.ts        # 进程入口
├── cli/                 # 命令行参数解析
├── architecture/        # 架构契约（Phase 0 冻结接口）
├── application/         # 应用层过渡入口
├── platform/            # provider/permission/integration 平台占位
├── observability/       # Trace 模型、Bus、Sink、断言与回放
├── core/                # REPL、查询循环、上下文与系统提示
├── api/                 # Anthropic 流式客户端
├── tools/               # 工具定义、注册、执行器
├── state/               # Zustand Store
├── ui/                  # Ink 界面组件
├── services/            # 配置读取（目前仅 config）
└── definitions/         # 跨模块定义
    ├── types/           # 核心类型（Message/Tool/PermissionMode 等）
    └── constants/       # 常量（app/exit-codes/ui-spinner）
```

模块依赖方向（当前约束）：

```text
entrypoint -> cli -> core(repl/query)
core -> api + tools + state + core(context/prompt)
application -> core + architecture/contracts
platform -> api + architecture/contracts
tools -> state(可选, 用于进度) + definitions/types
ui -> state + core(query)
services(config) -> api/cli
```

## 3. 核心运行流程

### 3.1 交互模式（REPL）

1. `entrypoint.ts` 启动 CLI
2. `cli/index.ts` 解析参数，调用 `startREPL`
3. `core/repl.ts` 创建 store，并构建上下文 `buildContext()`
4. `ui/App.tsx` 接收输入后调用 `query(store)`
5. `core/query.ts` 发起流式请求，消费事件并更新状态/UI
6. 出现工具调用时，走 `tools/executor.ts` 执行工具
7. 将 `tool_use` + `tool_result` 写回消息，再递归进入下一轮 `query`

### 3.2 单次模式（pipe/带 prompt）

1. 启动后直接把 prompt 写入消息
2. 执行一次查询循环
3. 将结果输出到 stdout 后退出

## 4. 查询引擎设计（`core/query.ts`）

当前事件模型：

- `thinking`：追加思考内容并展示
- `text`：流式文本输出并写入状态
- `tool_use_start`：识别工具调用开始
- `tool_input_complete`：工具输入完成后执行工具
- `tool_use`：兼容非分段输入的工具调用
- `done`：回合结束，记录 token 统计并落 assistant 消息

关键设计点：

1. **递归多轮**  
   工具执行后，立即把工具调用和结果写入消息，再递归调用 `query`，形成 agentic 回路。

2. **状态驱动 UI**  
   查询过程只更新 store，UI 订阅状态渲染，减少核心逻辑与界面耦合。

3. **上下文注入**  
   每轮请求构建 system prompt，包含环境信息、git 快照、CLAUDE.md 与 memory 内容。

当前限制：
- 未实现 turn 状态机（仅布尔/局部状态）
- 未实现 token/context budget 控制
- 未实现中断恢复与错误恢复策略矩阵

Phase 0 已冻结契约：
- `src/architecture/contracts/query-engine.ts`：`IQueryEngine`
- `src/application/query/engine.ts`：当前 `core/query.ts` 的过渡适配器

## 5. 工具运行平面

### 5.1 工具注册（`tools/registry.ts`）

当前使用单例注册表，已注册 9 个工具：

- P0：`Bash`, `Read`, `Write`, `Edit`, `Glob`, `Grep`
- P1：`WebFetch`, `WebSearch`, `AskUserQuestion`

注册表职责：
- 按名称获取工具
- 输出 API 可用的工具 schema 列表

### 5.2 工具执行（`tools/executor.ts`）

执行流程：

1. 查找工具
2. 构造 `ToolContext(cwd, permissionMode)`
3. 若为 `ask` 模式，触发审批
4. 设置工具进度状态
5. 执行工具并返回字符串结果
6. 失败时统一包成 `Error: ...`

权限模型（当前）：
- `auto`：直接执行
- `ask`：交互确认
- `plan`：仅模式值存在，尚无完整计划态流程

实现事实补充：
- Bash 工具在无 `/bin/sh` 环境会回退到可用 shell 路径
- 无效 `cwd` 会回退到 `process.cwd()`，避免执行阶段直接 ENOENT
- `src/architecture/contracts/tool-runtime.ts` 已冻结 `IToolRuntime` 执行契约

### 5.3 工具结果回写

`query.ts` 会把工具调用和结果写为内部消息：
- assistant `tool_use`
- user `tool_result`

这两类消息默认不在主 UI 消息列表展示（`isToolResult` 标记）。

## 6. 状态管理（`state/store.ts`）

Store 由 `AppState + AppActions` 组成，核心状态域：

1. 配置域：`model`, `permissionMode`, `cwd`, `quiet`
2. 对话域：`messages`
3. 流式域：`isStreaming`, `streamingText`, `thinking`
4. 工具域：`pendingTool`, `toolProgress`
5. 质量域：`error`
6. 成本域：`inputTokens`, `outputTokens`

设计特征：
- 单 store 统一状态面
- actions 简单直接，便于测试与 UI 订阅

## 7. UI 层设计（Ink）

核心组件：

- `App.tsx`：根组件，负责输入、消息渲染与组件组合
- `PermissionPrompt.tsx`：工具授权交互
- `Spinner.tsx`：API/工具运行中的反馈
- `ErrorDisplay.tsx`：错误分类展示与建议
- `TokenUsage.tsx`：token 与成本估算展示

UI 设计取向（当前）：
- 功能优先，弱样式
- 通过 store 驱动的响应式渲染
- 将复杂逻辑留在 `core/tools/state`，UI 只做展示与交互触发

## 8. 上下文与提示词设计

### 8.1 Context（`core/context.ts`）

当前收集内容：
- `cwd`
- git 分支与简要状态（若可用）
- 多级 `CLAUDE.md`（用户级、项目级、父级）
- memory 目录中的 markdown 内容
- 基础系统信息（平台、Node 版本、时间）

### 8.2 Prompt（`core/prompt.ts`）

将 context 拼为系统提示词，作为每轮 API 请求的 `system` 字段输入。

## 9. API 层设计（`api/client.ts`）

当前职责：

1. 创建 Anthropic client（读取配置/环境变量）
2. 封装 stream 事件并转换为内部 `StreamEvent`
3. 支持 `input_json_delta` 聚合工具输入

当前限制：
- token 统计目前未从流式事件完整回填
- 缺少重试、熔断、fallback provider 机制

Phase 0 过渡实现：
- `src/platform/provider/anthropic-provider.ts` 以 `IProvider` 契约封装当前 provider

## 10. 当前工程质量状态（事实）

最近一次验证基线：

- Build：通过
- TypeCheck：通过
- Lint：通过（`rewrite/biome.json` 本地配置，避免根目录配置不兼容）
- Test：`61 pass / 2 skip / 0 fail`
  - skip：2 个联网测试（WebFetch/WebSearch）

## 11. Phase 0 冻结产物（事实）

- `docs/adr/ADR-001-query-plane.md`
- `docs/adr/ADR-002-execution-permission-plane.md`
- `docs/adr/ADR-003-integration-plane.md`
- `docs/adr/ADR-004-orchestration-plane.md`
- `src/architecture/contracts/query-engine.ts`
- `src/architecture/contracts/tool-runtime.ts`
- `src/architecture/contracts/provider.ts`
- `src/architecture/contracts/orchestrator.ts`
- `src/application/` 与 `src/platform/` 目录骨架（不改变现有运行入口）

## 12. 当前设计约束

1. **单向依赖**：UI 不直接依赖 API，实现逻辑统一走 core/tools
2. **能力分层**：Query、Execution、Integration、Orchestration 四个平面分离演进
3. **接口先行**：在新增 Provider/MCP/Agent 前先定义边界接口
4. **质量门前置**：每阶段先修复 build/types/lint/test，再扩功能

## 13. 原版核心模块对标机制（新增）

为避免 `rewrite` 演进成“只在本地自洽、但与原版能力面脱节”，后续每个大模块必须执行“先分析原版，再实现 rewrite，再回对标”的闭环。

统一流程（每个模块都走）：

1. **Baseline（原版现状）**  
- 定位原版模块入口与关键文件（`claude-code-run/src`）  
- 记录能力边界、事件/状态模型、失败恢复路径、可观测点

2. **Target（rewrite 目标）**  
- 明确本阶段要达到的能力级别（L1/L2/L3），不盲目追平原版全部复杂度  
- 冻结本阶段接口与非目标（Out of Scope）

3. **Build（实现与验证）**  
- 在 `rewrite` 按契约实现  
- 通过 build/type/lint/test 与模块专属断言

4. **Compare（回对标评估）**  
- 用统一维度打分：`能力覆盖 / 稳定性 / 调试可见性 / 安全边界 / 复杂度成本`  
- 输出“已对齐 / 部分对齐 / 明确缺口 + 下一阶段计划”

模块对标产物要求（每个大模块至少包含）：
- 原版入口文件清单
- rewrite 对应实现清单
- 差距表（功能、风险、取舍）
- 下一阶段补齐路线

## 14. 示例：观测/追踪体系对标（Phase 0.1）

### 14.1 原版（`src`）核心能力快照

原版观测/追踪体系是“生产级重型方案”，典型能力包括：
- OpenTelemetry tracing（span 生命周期、上下文传播、异常记录）
- Perfetto/Beta tracing 辅助链路
- telemetry exporter/logger/隐私级别与策略控制
- 会话级事件、成本与分析链路（含 session 维度）

代表性入口（示例）：
- `src/utils/telemetry/sessionTracing.ts`
- `src/services/analytics/firstPartyEventLogger.ts`
- `src/services/analytics/firstPartyEventLoggingExporter.ts`
- `src/QueryEngine.ts`（session_id 与多阶段事件输出）

### 14.2 rewrite（Phase 0.1）当前实现

`rewrite` 已落地“最小可观测基线”，目标是先解决“卡住不可定位”：
- 统一 Trace 事件模型：`session_id/trace_id/turn_id/span_id/stage/event/status/metrics/payload`
- 进程内 Trace Bus（异步非阻塞，队列溢出时丢弃低优先级）
- 双 Sink：`trace.jsonl` + 控制台关键摘要
- 链路断言器：turn/tool/provider/orphan span 规则校验
- sidecar 调试：`scripts/trace-tail.sh`

实现入口：
- `src/observability/*`
- `src/core/query.ts`
- `src/api/client.ts`
- `src/tools/executor.ts`
- `src/state/store.ts`
- `src/core/repl.ts`

### 14.3 对标结论（当前阶段）

| 维度 | 原版 | rewrite Phase 0.1 | 结论 |
|---|---|---|---|
| 事件链路完整性 | 高（跨系统 tracing） | 中（REPL 主链路完整） | rewrite 达到当前阶段目标 |
| 调试定位效率 | 高（成熟 telemetry 工具链） | 中高（JSONL + 断言 + sidecar） | 对本地研发已足够 |
| 生产级集成能力 | 高（OTel/exporter/策略） | 低（未接外部平台） | 明确缺口，后续阶段补齐 |
| 实现复杂度 | 高 | 低 | rewrite 复杂度更可控 |

当前判断：
- 对“Phase 0.1 目标”来说，rewrite 方案是合理且更务实的；
- 对“生产级遥测完备度”来说，原版仍显著领先。

下一步补齐方向（非本阶段）：
1. 引入可选 OTel 适配层（保持现有 Trace 模型不破坏）
2. 增加跨进程/跨会话 trace 关联能力
3. 将 trace 断言接入 CI，作为回归门禁之一

## 15. Claude 全局模块架构（对标总图，新增）

> 目的：在“观测/追踪体系”之外，给出可逐项对标的整机模块地图。  
> 说明：`Query/Execution/Integration/Orchestration` 四平面是“演进控制面”；本节九大模块是“工程落地面”，两者一一映射。

### 15.1 模块成熟度分级（统一口径）

- `L0`：仅有目录/概念，无稳定入口
- `L1`：可运行最小实现，但缺少治理与恢复
- `L2`：可持续开发，具备基本测试与错误处理
- `L3`：生产级，具备策略、可观测、回归门禁与扩展能力

### 15.2 九大模块拆分（原版 Claude -> rewrite 对标）

| 模块 | 核心职责 | 原版参考入口（`src/`） | rewrite 当前入口（`rewrite/src/`） | 当前级别 | 关键缺口 |
|---|---|---|---|---|---|
| M1 交互接入层 | CLI 参数、REPL 交互、命令入口、多模式启动 | `main.tsx` `entrypoints/*` `cli/*` `commands/*` `screens/*` `components/*` | `entrypoint.ts` `cli/*` `ui/*` `core/repl.ts` | L1-L2 | 命令体系、运行模式和交互能力面不足 |
| M2 会话编排层 | 会话生命周期、transcript、成本累计、回合管理 | `QueryEngine.ts` `history.ts` `cost-tracker.ts` | `core/repl.ts` `state/store.ts` | L1 | 仅基础回路，无完整会话状态机与持久化治理 |
| M3 查询推理层 | 单回合循环、流式事件消费、工具回写与继续判定 | `query.ts` `query/*` | `core/query.ts` `application/query/engine.ts` | L2- | 缺少 budget、恢复矩阵、长会话压缩闭环 |
| M4 上下文记忆层 | System Prompt 组装、CLAUDE.md/memory/git 注入、压缩策略 | `context.ts` `context/*` `services/compact/*` `services/contextCollapse/*` `memdir/*` | `core/context.ts` `core/prompt.ts` | L1-L2 | 仅注入，无预算分配、压缩策略编排与质量评估 |
| M5 工具执行与权限层 | 工具注册/执行、权限判定、沙箱边界、审计 | `tools.ts` `tools/*` `Tool.ts` `utils/permissions/*` `utils/sandbox/*` | `tools/registry.ts` `tools/executor.ts` `platform/permission/*` | L2- | 风险分级、策略规则、审计与沙箱治理不足 |
| M6 集成生态层 | Provider 抽象、MCP/Plugin/Skill 接入、远程能力协同 | `services/api/*` `services/mcp/*` `services/plugins/*` `plugins/*` `skills/*` | `api/client.ts` `platform/provider/*` `platform/integration/*` | L1 | 单 provider，MCP/Plugin/Skill 未接入主平面 |
| M7 任务与 Agent 编排层 | Plan/Task/Agent 生命周期、多任务执行、协作协议 | `tasks/*` `Task.ts` `commands/tasks/*` `buddy/*` `coordinator/*` | `application/orchestrator/index.ts`（noop） | L0-L1 | 仅契约占位，无任务模型、执行器与并发治理 |
| M8 观测与治理层 | Trace/Telemetry、成本/性能、断言与回放、质量门禁 | `utils/telemetry/*` `services/analytics/*` `commands/ant-trace/*` | `observability/*` `docs/trace-model.md` | L2（Phase 0.1） | 外部遥测平台接入与跨会话关联待补齐 |
| M9 平台基础设施层 | 配置、迁移、守护进程、远程运行、通用基建 | `services/*` `migrations/*` `daemon/*` `server/*` `environment-runner/*` | `services/config.ts`（最小） | L0-L1 | 基础设施平面尚未成型 |

### 15.3 依赖与边界（必须遵守）

推荐单向依赖：

```text
M1 交互接入
  -> M2 会话编排
    -> M3 查询推理
      -> M5 工具执行与权限
      -> M6 集成生态
    -> M4 上下文记忆
  -> M8 观测与治理（旁路写入，不反向控制主流程）

M7 任务与Agent编排
  -> 调度 M2/M3/M5/M6

M9 平台基础设施
  -> 为 M1..M8 提供配置、持久化、远程与运维能力
```

边界约束（硬规则）：
- M1 不直接调用具体 provider/sdk，只走 M2/M3 暴露能力
- M3 不直接依赖 UI 组件；状态更新必须经过 store/事件
- M5 的权限决策必须集中，不允许散落到各工具实现
- M6 对外部生态统一注册，不允许 query 层直连 MCP/Plugin 细节
- M8 只做观测与判定，不在观测逻辑里修改业务结果

### 15.4 模块对标优先级（除了 M8 以外）

按“主链路优先 + 风险前置”排序：

1. `M3 查询推理层`：先补状态机、预算与恢复（直接决定可持续性）
2. `M5 工具执行与权限层`：补风险分级、规则引擎、审计（直接决定安全边界）
3. `M4 上下文记忆层`：补 compact/collapse 与质量评估（直接决定长会话稳定）
4. `M6 集成生态层`：引入多 provider + MCP/Plugin 统一入口（直接决定扩展性）
5. `M2 会话编排层`：补 transcript/成本/恢复策略（保证跨回合一致性）
6. `M7 任务与 Agent 编排层`：在主回路稳定后落地任务系统
7. `M9 平台基础设施层`：配套迁移、daemon、远程能力
8. `M1 交互接入层`：持续补命令面与体验（跟随能力面增长迭代）

### 15.5 每个模块的一一对标模板（落地执行）

后续每做一个模块，都按以下模板补充到 `docs/architecture/system-design.md` 对应章节：

```md
#### 模块：M?

1) Baseline（原版）
- 入口文件：
- 关键能力：
- 失败恢复路径：
- 可观测点：

2) Target（rewrite 阶段目标）
- 本阶段级别目标（L?）：
- In Scope：
- Out of Scope：
- 冻结接口：

3) Build（实现）
- rewrite 变更文件：
- 核心策略/状态机：
- 安全边界：

4) Compare（回对标）
- 能力覆盖：?/5
- 稳定性：?/5
- 调试可见性：?/5
- 安全边界：?/5
- 复杂度成本：?/5
- 结论：已对齐 / 部分对齐 / 明确缺口

5) Next
- 下一阶段补齐项（最多 3 条）：
```

### 15.6 现在可以直接启动的对标批次

- 批次 A（主链路稳态）：`M3 + M5 + M4`
- 批次 B（扩展能力）：`M6 + M2`
- 批次 C（平台化）：`M7 + M9 + M1`

判定标准：
- 每个模块完成后，必须产出“原版入口清单 + rewrite 实现清单 + 差距表 + 下一步计划”
- 每个批次结束后，必须跑一次全量质量门（build/type/lint/test + 模块断言）
