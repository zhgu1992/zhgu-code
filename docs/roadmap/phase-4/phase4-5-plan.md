# Phase 4.5 - 生产流闭环计划（wip4-07）

- Status: In Progress
- Updated: 2026-04-14
- Owner: rewrite-orchestrator

## 1. 背景

Phase 4 已完成能力底座（状态机、审批继承、汇聚策略、收口模板），但主运行链路仍是“最小接线”形态。  
Phase 4.5 的目标是把编排能力从“可测试模块”推进到“可直接使用的生产流”，并为 Phase 5 质量平面提供稳定输入。

## 2. 目标（Goal）

交付可运行的端到端编排闭环：

1. `/plan -> submit -> approve -> execute -> aggregate -> output` 可在真实交互路径跑通。
2. 审批拒绝与权限漂移在运行时被统一阻断，错误语义稳定（`permission_denied` / `plan_mode_blocked`）。
3. `plan/task/approval/audit` 事件链可追踪、可回放、可验收。
4. 产出可直接作为 Phase 5 输入的证据包（门禁命令、事件样本、回滚基线）。

## 3. 范围与边界

In Scope:

1. Plan runtime session 与 planId 生命周期持久在会话内。
2. 显式审批事件流（submit/approve/reject）接入 query 主链路。
3. Task 队列与状态迁移接入真实工具执行与结果返回。
4. 聚合策略参与真实输出收敛（至少 `first_success` / `all_required`）。
5. 增加 e2e 级测试与验收文档模板。

Out of Scope:

1. 分布式调度、跨进程任务编排。
2. 复杂持久化后端（数据库/外部队列）。
3. 多租户 RBAC 与组织级策略中心。

## 4. 依赖与关键路径

关键路径（必须串行）：

1. `P45-S01 Runtime Session Skeleton`
2. `P45-S03 Approval Runtime Wiring`
3. `P45-S05 Task Queue + Executor Binding`
4. `P45-S06 Aggregation Runtime Wiring`
5. `P45-S07 Audit Chain Completion`
6. `P45-S08 E2E + Acceptance`

可并行泳道：

1. 泳道 A（运行时主链）：`S01 -> S03 -> S05 -> S06`
2. 泳道 B（可观测性）：`S02` 与 `S04` 可在 `S03` 后并行推进
3. 泳道 C（文档与回滚）：`S09` 可在 `S07` 后并行准备

## 5. 执行拆解（PR 级）

### P45-S01 Runtime Session Skeleton

- Why: 解决“planId 仅临时拼装、不可稳定追踪”的问题。
- Change Set:
1. 建立会话级 runtime session 容器。
2. 统一 active plan context 的读写入口。
3. 明确 plan snapshot 结构（含状态、审批、任务索引）。
- 关键文件:
1. `rewrite/src/application/orchestrator/runtime-session.ts`（新增）
2. `rewrite/src/application/orchestrator/index.ts`
3. `rewrite/src/state/store.ts`
- Verification:
1. `bun test src/__tests__/phase4_plan_state_machine.test.ts`
2. `bun test src/__tests__/phase4_approval_inheritance.test.ts`
- Exit Criteria:
1. 单会话仅允许一个 active plan context。
2. `draft/awaiting-approval/running/...` 状态快照可读取。
- Rollback: 回退到“无 session 持久化 + 每轮临时 plan”模式。

### P45-S02 PlanId/TaskId 关联注入

- Why: 解决 query 输出与编排状态链断裂。
- Change Set:
1. turn-state/query-runner 注入 `planId/taskId` 关联字段。
2. 为 tool orchestrator 增加上下文字段透传。
- 关键文件:
1. `rewrite/src/application/query/query-runner.ts`
2. `rewrite/src/application/query/turn-state.ts`
3. `rewrite/src/application/query/tool-orchestrator.ts`
- Verification:
1. `bun test src/__tests__/phase1_query_state_integration.test.ts`
2. `bun test src/__tests__/phase4.test.ts`
- Exit Criteria:
1. 单轮中可以还原 `turn -> plan -> task` 映射。
2. 无 plan 场景保持兼容。
- Rollback: 移除关联字段，仅保留旧 turn 语义。

### P45-S03 Approval Runtime Wiring

- Why: 解决“plan 可切换，但 submit/approve/reject 不进入执行链”的问题。
- Change Set:
1. 将 `submit/approve/reject` 接入 query 主链路。
2. 审批拒绝时统一向 task/tool 返回 `permission_denied`。
3. 未审批时所有任务保持 `pending` 或直接阻断入队。
- 关键文件:
1. `rewrite/src/application/orchestrator/approval.ts`
2. `rewrite/src/application/query/query-runner.ts`
3. `rewrite/src/core/commands/mode-command.ts`（必要时扩展触发入口）
- Verification:
1. `bun test src/__tests__/phase4_approval_inheritance.test.ts`
2. `bun test src/__tests__/phase2_executor_governance.test.ts`
- Exit Criteria:
1. 未审批 plan 不可执行 task。
2. reject 后错误语义稳定且可追踪。
- Rollback: 强制 `ask` 模式并关闭审批事件入口。

### P45-S04 Permission Drift Guard

- Why: 解决 plan/task/tool 三层权限可能漂移的问题。
- Change Set:
1. 继承矩阵运行时校验（plan -> task -> tool）。
2. 检测越权自动降级 `ask` 并记录原因码。
- 关键文件:
1. `rewrite/src/application/orchestrator/permission-inheritance.ts`
2. `rewrite/src/tools/executor.ts`
3. `rewrite/src/platform/permission/engine.ts`
- Verification:
1. `bun test src/__tests__/phase4_approval_inheritance.test.ts`
2. `bun test src/__tests__/phase2_boundary_hardening.test.ts`
- Exit Criteria:
1. 无法出现“上游 ask，下游 auto”的扩权执行。
2. 漂移事件含 `reasonCode + eventSeq`。
- Rollback: 保留拒绝策略，取消自动降级。

### P45-S05 Task Queue + Executor Binding

- Why: 解决任务生命周期与工具执行脱节。
- Change Set:
1. 引入 task queue 与 registry 绑定执行器。
2. 保证 `pending -> running -> completed|failed|canceled` 可观测。
3. 失败终态原因写入审计链。
- 关键文件:
1. `rewrite/src/application/orchestrator/task-model.ts`
2. `rewrite/src/application/orchestrator/task-state.ts`
3. `rewrite/src/application/query/tool-orchestrator.ts`
- Verification:
1. `bun test src/__tests__/phase4_task_lifecycle.test.ts`
2. `bun test src/__tests__/phase4.test.ts`
- Exit Criteria:
1. 工具执行必须挂在 task 上。
2. 终态不可逆且幂等。
- Rollback: 降级为单任务直跑，不保留队列。

### P45-S06 Aggregation Runtime Wiring

- Why: 解决多任务结果无法稳定收敛到最终输出。
- Change Set:
1. 将 `first_success/all_required` 接入 runtime 输出路径。
2. 冲突输出包含 `conflicts + resolution`。
- 关键文件:
1. `rewrite/src/application/orchestrator/aggregation.ts`
2. `rewrite/src/application/orchestrator/aggregation-strategies.ts`
3. `rewrite/src/application/query/formatting.ts`
- Verification:
1. `bun test src/__tests__/phase4_agent_aggregation.test.ts`
2. `bun test src/__tests__/query-formatting.test.ts`
- Exit Criteria:
1. 聚合策略可配置且稳定。
2. 同输入重复运行输出一致。
- Rollback: 降级为串行单结果输出。

### P45-S07 Audit Chain Completion

- Why: 解决 plan/task/approval/tool 链路可追踪性不足。
- Change Set:
1. 统一 trace 事件字段（`planId/taskId/toolName/reasonCode/eventSeq`）。
2. 拒绝路径事件序号连续可回放。
- 关键文件:
1. `rewrite/src/observability/trace-model.ts`
2. `rewrite/src/application/query/audit/*.ts`
3. `rewrite/src/application/query/context-events.ts`
- Verification:
1. `bun test src/__tests__/phase2_audit_chain.test.ts`
2. `bun test src/__tests__/phase4_closure.test.ts`
- Exit Criteria:
1. 单次请求可串联全链路关键 ID。
2. 拒绝路径不丢事件。
- Rollback: 降级为 trace-only，保留最小字段。

### P45-S08 E2E + Acceptance Gate

- Why: 解决“模块测试通过但主链路不可用”的风险。
- Change Set:
1. 新增 e2e：成功流/拒绝流/漂移保护流。
2. 产出 acceptance 与 rollback 文档模板。
- 关键文件:
1. `rewrite/src/__tests__/phase4_5_e2e.test.ts`（新增）
2. `rewrite/docs/roadmap/phase-4/phase4-5-acceptance.md`（新增）
3. `rewrite/docs/roadmap/phase-4/phase4-5-rollback.md`（新增）
- Verification:
1. `bun test src/__tests__/phase4_5*.test.ts`
2. `bun test src/__tests__/phase4*.test.ts`
- Exit Criteria:
1. 至少 3 条 e2e 场景全绿。
2. 失败时可映射到明确回滚动作。
- Rollback: 停止推进 Phase 5，回退到 Phase 4 稳定基线。

### P45-S09 Closure + Phase 5 Handoff Pack

- Why: 确保 Phase 5 入口条件可机器校验。
- Change Set:
1. 输出 P45 收口记录（门禁结果、豁免、风险）。
2. 生成 Phase 5 启动输入包（命令矩阵、事件样本、失败样本）。
- 关键文件:
1. `rewrite/src/application/phase4/closure.ts`（必要时扩展 P45 字段）
2. `rewrite/docs/roadmap/phase-4/phase4-5-acceptance.md`
3. `rewrite/docs/roadmap/phase-5/README.md`（写入启动引用）
- Verification:
1. `bun test src/__tests__/phase4_closure.test.ts`
2. `bun test src/__tests__/phase1*.test.ts src/__tests__/phase2*.test.ts src/__tests__/phase3*.test.ts src/__tests__/phase4*.test.ts`
- Exit Criteria:
1. `phase5Blocked=false` 且无高危豁免。
2. Phase 5 启动文档字段完整。
- Rollback: 若任一硬门失败，保持 `phase5Blocked=true`。

## 6. 门禁矩阵（P45）

### G0 架构门（进入 S03 前）

1. `runtime-session` 数据结构冻结。
2. 审批错误语义与 Phase 2 对齐（`permission_denied/plan_mode_blocked`）。

### G1 运行时门（进入 S06 前）

1. `submit/approve/reject` 已接入主链。
2. task queue 与 executor 已绑定。

### G2 可观测门（进入 S08 前）

1. 关键 ID 全链路可追踪。
2. 漂移保护与拒绝路径事件完整。

### G3 放行门（进入 Phase 5 前）

1. `phase4_5_e2e` 全绿。
2. `phase1~phase4` 回归全绿。
3. 收口决策不为 `FAIL` 且无高危未关闭豁免。

## 7. 建议验收命令（可复跑）

1. `bun run build`
2. `bunx tsc --noEmit`
3. `bun run lint`
4. `bun test src/__tests__/phase4*.test.ts`
5. `bun test src/__tests__/phase4_5*.test.ts`
6. `bun test src/__tests__/phase1*.test.ts src/__tests__/phase2*.test.ts src/__tests__/phase3*.test.ts`

## 8. 与 Phase 5 的接口契约

P45 必须交付以下接口给 Phase 5：

1. 命令契约：一组可重复运行的 gate 命令（本地/CI 等价）。
2. 证据契约：至少 1 组成功流、1 组拒绝流、1 组漂移保护流事件样本。
3. 回滚契约：明确“降级到单任务直跑 + ask”触发条件和执行步骤。
4. 风险契约：未关闭豁免必须带过期时间与负责人。

## 9. Plan Mutation Protocol（执行中变更规则）

1. 可拆分：任何 `Sxx` 可拆为 `Sxx-a/Sxx-b`，但必须保留原验收口径。
2. 可插入：若发现阻塞，可插入 `Sxx+1` 作为“清障切片”，并更新依赖图。
3. 可降级：若稳定性受损，优先回退执行路径，不回退已验证的数据结构。
4. 可中止：若 `G1/G2` 连续失败两轮，暂停推进并回到 Phase 4 收口复盘。
