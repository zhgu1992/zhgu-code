# Phase 3 Rollback Playbook（WP3-E）

- Scope: `wip3-06` 收口回退预案
- Objective: 在 30 分钟内完成 `仅内建模式` 切换，阻断外接能力抖动。

## 1. Trigger Conditions

1. `phase3_*` 任一 hard gate 失败且影响线上稳定性。
2. provider/plugin 熔断频繁抖动，导致外接工具持续超时或拒绝。
3. 安全门误拦截比例升高且短期无法修复规则。

## 2. Rollback Target State

1. `listModelCallableTools()` 仅保留 `builtin` 来源。
2. MCP/Plugin/Skill 外接能力保留可见性，但 `callable=false`。
3. provider/plugin 熔断状态可追溯，禁止自动重试雪崩。

## 3. 30-Min Drill Checklist (Builtin-Only)

1. 冻结外接能力：registry rebuild 时启用 builtin-only 开关。
2. 打开熔断保护：将异常 provider/plugin 对应 circuit 置为 `open`。
3. 禁用外接入口：临时 deny 对应 providerId/pluginId。
4. 执行回归门禁：
- `bun test src/__tests__/phase1*.test.ts`
- `bun test src/__tests__/phase2*.test.ts`
- `bun test src/__tests__/phase3*.test.ts`
5. 记录审计：输出本次切换的 trace id、触发原因、恢复 owner 与复盘时间。

## 4. Exit Criteria

1. 外接异常根因已修复并通过专项测试。
2. 熔断项按 `half-open -> closed` 恢复，无新增雪崩。
3. 重新执行 hard gates，结果回写 `phase3-acceptance.md`。
