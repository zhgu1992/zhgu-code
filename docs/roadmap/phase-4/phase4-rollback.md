# Phase 4 Rollback Playbook（WP4-E）

- Scope: `wip4-06` 编排面收口回退预案
- Objective: 在 30 分钟内完成“编排降级 + 权限收敛”，阻断越权执行与任务雪崩。

## 1. Trigger Conditions

1. `phase4_*` 任一 hard gate 失败且存在状态机/权限链回归风险。
2. 任务 fan-out 或子任务汇聚异常导致结果不一致或失控重试。
3. 审批继承链漂移，出现 plan 与 task/tool 权限不一致。

## 2. Rollback Target State

1. Orchestrator 强制进入 `ask` 安全模式（禁止自动升级）。
2. 关闭子任务 fan-out，降级为单任务串行执行。
3. 工具调用仅允许继承权限，不允许绕过审批链。
4. Phase 5 推进标记强制置为 `blocked`。

## 3. 30-Min Drill Checklist

1. 切换模式：将执行权限强制收敛到 `ask`。
2. 禁用汇聚：关闭 `first_success/all_required` 并发汇聚入口。
3. 审批回退：仅保留 `plan_approved -> task_admitted -> tool_call_allowed` 最小链路。
4. 执行回归门禁：
- `bun test src/__tests__/phase1*.test.ts`
- `bun test src/__tests__/phase2*.test.ts`
- `bun test src/__tests__/phase3*.test.ts`
- `bun test src/__tests__/phase4*.test.ts`
5. 写审计记录：记录触发条件、负责人、恢复窗口、下一次复盘日期。

## 4. Exit Criteria

1. Plan/Task/Tool 三层权限继承一致性恢复。
2. Phase 4 hard gates 全绿并重新生成验收报告。
3. `phase5Blocked=false` 且风险豁免项状态合法（已审批且未过期）。
