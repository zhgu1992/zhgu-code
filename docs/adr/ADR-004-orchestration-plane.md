# ADR-004 Orchestration Plane

## Context
- 当前系统以单回路 REPL 为主，`plan` 仅是权限模式值，尚无任务生命周期管理。
- Phase 4 需要引入 Plan/Task/Agent 的编排能力，但当前没有统一编排契约。
- 若直接实现任务系统，容易与现有 query/tool/runtime 深度耦合。

## Decision
- 定义 `IOrchestrator` 契约，冻结编排面的最小生命周期方法：
  - `startSession`
  - `submitTask`
  - `updateTaskStatus`
  - `cancelTask`
  - `listTasks`
- 在 `src/application/orchestrator/index.ts` 提供 `NoopOrchestrator` 过渡实现，确保编译期依赖存在但不影响现有运行路径。
- 将任务状态规范为 `pending/running/completed/failed/canceled`。

## Consequences
- 未来可在 application 层逐步替换 noop 实现，接入真实 Task/Agent 执行器。
- Phase 0 不引入行为变更，避免 REPL 回归风险。
- 需要在 Phase 4 明确任务持久化、并发与可观测性策略，否则编排能力仍停留在结构层。

## Rejected options
- 把编排逻辑直接写进 `core/repl.ts`：会让交互层承担过多领域职责。
- 等实现 Task/Agent 后再统一接口：会导致不同任务通道各自定义状态模型，后期迁移成本高。
