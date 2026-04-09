# rewrite 架构设计（当前实现）

> 更新时间：2026-04-09  
> 文档定位：记录当前已落地的架构事实与核心设计模块  
> 说明：规划与路线图见 `readme.md`，本文件只描述“现在系统是怎么工作的”

## 1. 系统目标与边界

`rewrite` 是一个精简版 AI Coding CLI，目标是先提供可运行的主闭环：

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
├── core/                # REPL、查询循环、上下文与系统提示
├── api/                 # Anthropic 流式客户端
├── tools/               # 工具定义、注册、执行器
├── state/               # Zustand Store
├── ui/                  # Ink 界面组件
├── services/            # 配置读取（目前仅 config）
├── types.ts             # 跨模块核心类型
└── constants.ts         # 常量与模式定义
```

模块依赖方向（当前约束）：

```text
entrypoint -> cli -> core(repl/query)
core -> api + tools + state + core(context/prompt)
application -> core + architecture/contracts
platform -> api + architecture/contracts
tools -> state(可选, 用于进度) + types
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
- Test：`55 pass / 2 skip / 0 fail`
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
