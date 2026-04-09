# zhgu-code rewrite 架构评估与行动蓝图

> 更新时间：2026-04-09  
> 评估方式：`codebase-onboarding + blueprint + verification-loop`  
> 目标：先完成“大架构与大能力”，再逐步补细节
> 核心架构设计和演进见 design.md

## 1) 架构基线对比（大模块）

当前 `rewrite` 已具备最小可运行闭环，但与参考实现相比，仍处于“核心骨架版”。

| 维度 | 参考实现（`/src`） | rewrite（`/rewrite/src`） | 结论 |
|---|---:|---:|---|
| 文件规模 | 2882 | 32 | rewrite 是精简骨架，方向正确，但能力面尚未铺开 |
| Tools 子系统文件 | 197 | 11 | 仅覆盖基础工具与最小执行器 |
| Commands 子系统文件 | 219 | 0（仅单入口参数） | 命令面基本未建设 |
| Services 子系统文件 | 151 | 1 | 平台能力（MCP/插件/远程/策略）未建立 |

## 2) 大能力完成度（架构视角）

### A. 已打通的核心能力（可演示）
- CLI + REPL 主闭环（可输入、可流式输出、可多轮工具调用）
- 基础工具平台（注册、执行、权限确认）
- 基础状态与 UI（消息、spinner、错误、token 展示）
- 基础上下文注入（cwd/git/CLAUDE.md/memory）

### B. 已做但深度不足（工程层）
- Query 引擎：缺少中断恢复、预算控制、上下文压缩、异常路径收敛
- Permission：仅 `ask/auto` 基础流，缺少规则系统与风险分级
- Tool 执行：缺少统一结果预算、审计与更严格的沙箱边界
- API 层：缺少重试/降级/故障分类与 provider 抽象层
- 测试层：用例有基础覆盖，但质量门不闭环（见第 4 节）

### C. 关键未建设能力（平台层）
- 多入口运行面：commands 体系、SDK/daemon/server 面
- Agent/Task 编排面：子任务、异步任务、计划执行状态机
- MCP/Plugin/Skill 集成面：外部能力接入主平面尚未落地
- 长会话治理：compact/context-collapse/token-budget
- 可观测性：成本、性能、事件与错误遥测链路

## 3) 你当前“已完成功能”的真实层级判断

| 功能域 | 当前层级 | 判断 |
|---|---|---|
| CLI + REPL | L2（可开发） | 主流程可用，但运行模式单一 |
| Query + Streaming | L2-（可用但脆弱） | 缺少复杂异常和长会话治理 |
| Tools 基础集 | L2（可开发） | 9 个工具可跑，但安全与治理能力不足 |
| 权限与交互 UI | L2（可开发） | 有确认流，但无策略体系与自动化风控 |
| Context 构建 | L1.5（基础） | 有输入，无“上下文预算与压缩策略” |
| 平台扩展能力 | L0-L1 | MCP/插件/Agent/Task 基本未建 |

> 结论：你不是“没做完”，而是**已完成核心骨架（约 35%-45% 的平台能力）**，下一步应从“功能堆叠”切换到“平台平面建设”。

## 4) 当前质量门基线（verification-loop）

在 `rewrite` 目录实测：

1. Build：`PASS`（`bun run build` 成功）
2. Type Check：`PASS`（`bunx tsc --noEmit` 成功）
3. Lint：`PASS`（`rewrite/biome.json` 局部配置已生效）
4. Test：`55 pass / 2 skip / 0 fail`
- skip：2 个联网测试（WebFetch/WebSearch）

> 结论：当前版本已具备“稳定迭代基线”，可作为 Phase 1 的门禁起点。

## 5) 后续行动蓝图（先大后小）

### Phase 0：架构冻结（先统一设计）
目标：把后续 4 个大平面先设计清楚，避免边做边改。

1. 输出 4 份 ADR（查询平面、执行权限平面、扩展集成平面、编排平面）
2. 定义核心边界接口（`IQueryEngine`、`IToolRuntime`、`IProvider`、`IOrchestrator`）
3. 固化目录重组方案（不要求一次迁移完）

完成标准：
- 目录与接口文档固定，后续 PR 只在该框架内演进

#### Phase 0 详细实施计划（可直接执行）

当前状态（2026-04-09）：
- `WP0-A` 完成（`design.md` 已校准为当前事实口径）
- `WP0-B` 完成（4 份 ADR 已落地）
- `WP0-C` 完成（4 个核心接口已在 `src/architecture/contracts/` 冻结）
- `WP0-D` 完成（`src/application/` 与 `src/platform/` 已建立过渡骨架）
- `WP0-E` 完成（type/lint/test 阻塞项已清除）

范围（In Scope）：
- 只做架构与边界收敛，不做大功能实现
- 产出可评审文档 + 可编译接口骨架 + 最小目录重组
- 建立 Phase 1/2 的开发入口与约束

非目标（Out of Scope）：
- 不实现 MCP/Agent/Task 业务能力
- 不重写现有 query 全逻辑
- 不引入新的工具能力面

执行工作包（Work Packages）：

1. `WP0-A` 架构现状快照
- 产出：`design.md` 校准为当前事实（模块边界、数据流、状态面）
- 验收：文档可映射到 `src` 的每个核心目录，不含“未来实现描述”

2. `WP0-B` 四个 ADR 落地
- 产出：`docs/adr/ADR-00{1..4}-*.md`
- ADR 清单：
- `ADR-001-query-plane.md`（回合状态机、错误恢复、预算入口）
- `ADR-002-execution-permission-plane.md`（权限规则与风险分级）
- `ADR-003-integration-plane.md`（Provider/MCP/Plugin 接入边界）
- `ADR-004-orchestration-plane.md`（Plan/Task/Agent 生命周期）
- 验收：每个 ADR 必含 Context / Decision / Consequences / Rejected options

3. `WP0-C` 核心接口骨架
- 产出目录：`src/architecture/contracts/`
- 目标接口：
- `query-engine.ts`：`IQueryEngine`
- `tool-runtime.ts`：`IToolRuntime`
- `provider.ts`：`IProvider`
- `orchestrator.ts`：`IOrchestrator`
- 验收：接口可被当前代码引用且 `tsc --noEmit` 通过（不要求业务实现）

4. `WP0-D` 最小目录重组（非破坏）
- 产出目录：
- `src/architecture/`（架构层文档与契约）
- `src/platform/`（provider/permission/integration 占位）
- `src/application/`（query/orchestrator 过渡入口）
- 验收：现有入口 `entrypoint -> cli -> core/repl` 不受影响，运行路径不回归

5. `WP0-E` 质量门修复（为后续阶段清障）
- 必修项：
- 修复 2 个 type errors
- 处理 lint 配置不兼容（限定 rewrite 局部配置或脚本）
- 修复/隔离 Bash 测试环境依赖（`/bin/sh`）
- 验收：`build/type/test` 可作为后续阶段门禁

建议执行顺序（依赖图）：
- `WP0-A -> WP0-B -> WP0-C -> WP0-D`
- `WP0-E` 与 `WP0-B/WP0-C` 并行，但必须在 Phase 0 结束前完成

Phase 0 里程碑与 DoD：

1. M0（架构冻结）
- 4 个 ADR 评审通过
- `design.md` 与 `readme.md` 架构口径一致

2. M1（契约冻结）
- 4 个核心接口签名冻结
- 后续 PR 禁止绕过契约直接跨层耦合

3. M2（基线可迭代）
- `bun run build` 通过
- `bunx tsc --noEmit` 通过
- `bun test` 通过或有明确 skip 策略

Phase 0 建议交付物清单：
- `rewrite/design.md`（当前事实）
- `rewrite/readme.md`（路线与门禁）
- `rewrite/docs/adr/ADR-001..004`
- `rewrite/src/architecture/contracts/*.ts`
- `rewrite/tsconfig` 与 lint/test 脚本的最小修复

### Phase 0.1：链路追踪与可观测性基线（防“无反馈卡住”）
目标：在不重写业务逻辑前提下，先建立可追踪、可回放、可判定的最小观测链路。

1. 定义统一 Trace 事件模型（`session_id/trace_id/turn_id/span_id/stage/event/status/metrics/payload`）
2. 建立进程内 Trace Bus（异步、非阻塞），统一接入 `ui/query/provider/tool/state/permission`
3. 落地双 Sink：
- `trace.jsonl`（结构化落盘，支持回放与比对）
- 控制台实时摘要（主窗口只显示关键状态）
4. 支持 sidecar 观测窗口（推荐 `tail -f trace.jsonl`），用于查看完整链路细节
5. 增加最小链路断言规则：
- 每个 `turn.start` 必有 `turn.end|turn.error`
- 每个 `tool.call.start` 必有 `tool.call.end|tool.call.error`
- `provider.stream.start` 后必须出现 `first_event|connect_timeout`
- 禁止孤儿 span（有子事件无父事件）
6. 增加安全与性能边界：
- 敏感字段脱敏（token/key/header）
- 大 payload 截断与 hash
- Trace 队列满时丢弃低优先级事件，避免阻塞主链路

范围（In Scope）：
- 只做观测能力与调试视图，不改变主业务路径
- 覆盖 REPL 主链路：输入 -> query -> provider stream -> tool -> 回写 -> 输出
- 输出“链路是否符合预期”的最小自动判定结果

非目标（Out of Scope）：
- 不引入完整遥测平台（OTLP/Prometheus/Grafana）
- 不做可视化 Web 控制台
- 不重构 Query/Tool Runtime 的核心实现

执行工作包（Work Packages）：

1. `WP0.1-A` 事件模型冻结
- 产出：`docs/trace-model.md` + TypeScript 事件类型定义
- 验收：关键阶段事件字段完整且可扩展

2. `WP0.1-B` Trace Bus 与埋点接入
- 产出：`src/observability/trace-bus.ts` + 关键路径埋点
- 验收：一次完整请求可串起全链路事件

3. `WP0.1-C` Sink 与 sidecar 观测
- 产出：JSONL sink + console sink + `scripts/trace-tail.sh`
- 验收：第二终端可实时查看完整链路，不影响主交互

4. `WP0.1-D` 链路断言与失败报告
- 产出：trace assertions 校验器
- 验收：能输出“通过/失败 + 缺失事件清单”

5. `WP0.1-E` 使用手册与回归用例
- 产出：README 调试章节 + 1 个“连接超时”与 1 个“工具调用”示例回放
- 验收：新同学可按文档复现并定位问题

Phase 0.1 里程碑与 DoD：

1. M0（事件可追踪）
- 从用户输入到最终输出，每个关键阶段均有结构化事件

2. M1（问题可定位）
- 出现卡住/超时时，能在 1 分钟内定位到具体阶段（连接、流、工具、回写）

3. M2（链路可验收）
- 断言规则可自动判定一次请求是否符合预期

Phase 0.1 建议交付物清单：
- `rewrite/docs/trace-model.md`
- `rewrite/src/observability/*`
- `rewrite/scripts/trace-tail.sh`
- `rewrite/readme.md`（调试与验收流程补充）

### Phase 1：Query Engine v2（主脑平面）
目标：让核心对话引擎从“可跑”升级为“可持续”。

1. 引入 turn 状态机（idle/streaming/tool-running/recovering/stopped）
2. 引入 token/context budget 与自动续写策略
3. 引入 compact/collapse 插件点（先 stub，再实现）
4. 统一错误分类与恢复路径（API/Tool/Permission/Network）

完成标准：
- 连续 20+ 轮对话不失稳
- 中断/恢复/重试路径可测试

### Phase 2：Execution & Permission Plane（执行安全平面）
目标：把工具执行从“调用”升级到“治理”。

1. 权限规则模型（allow/deny/ask + 作用域 + 来源）
2. 工具风险分级（文件写入、shell、网络、外部系统）
3. 工具审计事件（谁、何时、执行了什么、结果）
4. Bash/文件工具增加更严格边界与错误语义

完成标准：
- 高风险工具默认可控
- 权限与审计可追踪

### Phase 3：Integration Plane（MCP/Plugin/Skill）
目标：建立“能力接入层”，而非继续硬编码工具。

1. MCP 连接生命周期管理（发现、鉴权、可用性）
2. Plugin/Skill 装载协议（元数据、版本、禁用与回退）
3. 统一工具目录（内建工具 + 外接能力同一注册面）

完成标准：
- 至少 1 条外部能力通路稳定可用
- 接入层不侵入 query 核心

### Phase 4：Orchestration Plane（Agent/Task/Plan）
目标：完成复杂任务所需编排能力。

1. Plan mode 从“标志位”升级为“状态机 + 审批流”
2. Task 模型（创建、状态、输出、取消）
3. Agent 子任务执行与结果汇聚协议

完成标准：
- 单任务可拆分执行并收敛
- 计划与执行链路可观测

### Phase 5：质量与发布平面（可迭代）
目标：把“开发可跑”升级为“持续可交付”。

1. 修复 typecheck 与 lint 链路
2. 测试分层：unit/integration/e2e + 网络测试隔离
3. 统一 PR 质量门（build、types、lint、tests、security）

完成标准：
- CI 绿灯可作为合并前置条件
- 回归成本可控

## 6) 建议的近期执行顺序（你下一步就做这个）

1. 先做 Phase 0（ADR + 目录/接口冻结），不要直接补零散功能。  
2. 紧接做 Phase 0.1（链路追踪基线），先把“可观测与可定位”补齐。  
3. 再进入 Phase 1（Query Engine v2），这是所有后续能力的“主依赖”。  
4. 再做 Phase 2（执行与权限平面），确保能力扩展前先守住风险。  
5. 最后并行推进 Phase 3/4（集成面 + 编排面），形成平台能力闭环。  

---

如果后续你愿意，我可以直接在本仓库按这个蓝图落第一个交付：  
`Phase 0 ADR + 目录重构草案 + Query/Tool/Provider/Orchestrator 四个接口骨架`。  
