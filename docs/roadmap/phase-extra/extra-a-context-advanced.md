# Phase Extra-A - Context Advanced（压缩专项）

- Status: Not Started
- Updated: 2026-04-13
- Parent: [Phase Extra 总览](./README.md)

## 启动前对标结论（A 轨必填）

- 对标状态: Pending（未完成对标，禁止进入实现）
- 对标日期: 待执行（启动当日填写）
- 对标范围: Context Compression / Overflow Recovery / Compression Quality
- 参考源码（启动时逐项核对）:
  - `claude-code-run/src/query.ts`
  - `claude-code-run/src/query/tokenBudget.ts`
  - `claude-code-run/src/services/compact/*`
  - `claude-code-run/src/services/contextCollapse/*`
  - `rewrite/src/application/query/*`
  - `rewrite/src/observability/*`

### 基线结论（待对标完成后冻结）

1. 已对齐项:
- 暂无（待对标完成后补齐）。
2. 差异项:
- 能力覆盖: `snip/micro/auto/reactive/collapse` 未形成统一策略编排。
- 稳定性: overflow 场景缺少完整恢复链与熔断保护。
- 可观测性: 压缩效果缺少统一质量口径与回归门禁。
- 安全边界: 自动策略切换条件与降级边界未冻结。
3. 本阶段范围:
- In Scope: 压缩策略编排、overflow 恢复、压缩质量评估。
- Out of Scope: Query 主干重构、跨阶段权限模型改造。

## 目标

1. 把压缩能力做成可插拔策略层。
2. 建立 overflow 恢复与失败熔断机制。
3. 建立“成功率、恢复率、误伤率”质量门禁。

前置约束：
1. 必须先消费 [Compression TODO Pack](../phase-2-5/compression-todo-pack.md)。
2. 若 TODO Pack 字段不完整，禁止进入实现。

## WIP 执行门禁记录（A 轨）

| WIP | 为什么做 + 问题与边界 | 超越目标 | 核心设计 | 验证Case/DoD | 风险回滚 | 状态 |
|---|---|---|---|---|---|---|
| `wipx-02` Extra-A 压缩策略编排 | 压缩策略复杂，独立模块化更稳妥 | 把压缩策略做成可插拔策略层 | `snip/micro/auto/reactive/collapse` 入口统一 | `CTXC-001~008` 通过 | 开关回退 monitoring-only | Pending |
| `wipx-03` Extra-A Overflow 恢复与熔断 | 高负载场景易循环失败 | 建立溢出恢复链与失败熔断保护 | `overflow -> recover -> retry/stop` 明确状态与预算 | `CTXR-001~007` 通过 | 熔断后强制降级 stop-only | Pending |
| `wipx-04` Extra-A 压缩质量评估门 | 缺少“压缩是否有效”的量化口径 | 建立质量基线与回归门禁 | 成功率/恢复率/误伤率指标 + 验收命令 | `CTXQ-001~006` 通过 | 指标不达标不放量 | Pending |

## A 轨完成标准（DoD）

1. 压缩策略可灰度启停并支持一键回滚。
2. Overflow 恢复链具备明确 budget 与 stop 条件。
3. 质量门禁覆盖成功率、恢复率、误伤率。
4. 不破坏 `phase1_* ~ phase5_*` 前置门。

## 依赖与执行顺序（A 轨）

1. `wipx-02 -> wipx-03 -> wipx-04`
2. 可与 Extra-B 并行，但不可绕过总览中的 `wipx-01`/`wipx-09`。

## 里程碑（A 轨）

1. MX-A1（策略层可运行）：完成 `wipx-02`
2. MX-A2（恢复链可治理）：完成 `wipx-03`
3. MX-A3（质量门禁生效）：完成 `wipx-04`

## 建议验收命令（A 轨草案）

1. `bun run build`
2. `bunx tsc --noEmit`
3. `bun run lint`
4. `bun test src/__tests__/phase-extra*.test.ts`
5. `bun test src/__tests__/phase1*.test.ts src/__tests__/phase2*.test.ts src/__tests__/phase3*.test.ts src/__tests__/phase4*.test.ts src/__tests__/phase5*.test.ts`
