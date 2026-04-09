# ADR-001 Query Plane

## Context
- 当前查询循环位于 `src/core/query.ts`，已支持流式事件、多轮工具调用和递归回合。
- 状态更新散落在 query 主循环里，缺少显式“回合状态机”与预算入口。
- Phase 1 需要在不破坏现有运行路径的前提下升级 Query Engine。

## Decision
- 定义 `IQueryEngine` 作为查询平面的统一契约，冻结最小执行签名：`query(store, options?)`。
- 在契约中预留预算与回合元数据（`QueryTurnBudget`、`turnId`）字段，不在 Phase 0 实现业务逻辑。
- 保持 `entrypoint -> cli -> core/repl -> core/query` 现有路径，新增 `src/application/query/engine.ts` 作为过渡适配层。

## Consequences
- 现有逻辑无需重写即可纳入契约边界，后续 Query v2 可在应用层替换实现。
- 预算、恢复等能力有稳定扩展点，避免后续在 `core/query.ts` 内继续横向堆叠。
- 需要在后续阶段补齐状态机与错误恢复策略，否则契约仅为结构约束。

## Rejected options
- 直接在 Phase 0 重写 Query Engine：风险高、回归面大，不符合“先冻结边界”的目标。
- 仅写文档不落接口文件：无法形成编译期约束，后续容易继续跨层耦合。
