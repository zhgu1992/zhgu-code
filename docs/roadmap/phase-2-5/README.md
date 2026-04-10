# Phase 2.5 - Context Monitoring Plane（监控先行）

- Status: Not Started
- Updated: 2026-04-10

## 启动前对标结论（必填）

- 对标状态: Pending（未完成对标，禁止进入实现）
- 对标日期: 待执行（启动当日填写）
- 对标范围: Context Usage Monitoring / Warning & Blocking Signals / Monitoring Commands
- 参考源码（启动时逐项核对）:
  - `claude-code-run/src/query.ts`
  - `claude-code-run/src/query/tokenBudget.ts`
  - `claude-code-run/src/services/compact/autoCompact.ts`
  - `claude-code-run/src/commands/context/*`
  - `rewrite/src/application/query/budget.ts`
  - `rewrite/src/application/query/query-runner.ts`
  - `rewrite/src/observability/*`

### 基线结论（待对标完成后冻结）

1. 已对齐项:
- 已具备 token/context 基础 budget guard（Phase 1）。
- 已具备基础 trace 事件与断言框架。
2. 差异项:
- 能力覆盖: 缺少 context 专项监控面（统一 usage、阈值状态、来源拆分）。
- 稳定性: 缺少“接近上限/阻断前”预警链路。
- 可观测性: 缺少 context 治理事件和运行看板入口。
- 安全边界: 尚未冻结 warning/blocking 的统一语义。
- 复杂度: 监控逻辑分散，后续策略接入风险高。
3. 本阶段范围:
- In Scope: context 监控、告警、阻断信号、命令输出统一、观测事件
- Out of Scope: 自动压缩策略、reactive/collapse 编排、复杂 overflow 恢复链

## 目标

先把 context 治理做成“可见、可判定、可追踪”的监控平面，为后续压缩策略提供稳定输入。

## 超越基线讨论（必填）

> 原则：先监控，后策略；先可观测，后自动化。

### 1) 超越方向

1. 可观测优先：先统一 context 指标与阈值语义，避免策略盲飞。
2. 非侵入优先：不引入复杂压缩行为变化，保证主链路稳定。
3. 交接友好优先：为后续 agent 留标准 TODO 与可执行入口。

### 2) 超越指标

1. 100% 回合输出 context usage 与阈值状态（warning/error/blocking）。
2. 100% context 阻断事件包含结构化 reasonCode。
3. `/context` 输出与 query 真实 API 视图口径一致。
4. Phase 2.5 新增测试至少 12 条 case，且不引入 `phase1_*`、`phase2_*` 回归失败。

### 3) 创新工作轨

1. SX2.5-1 Context Health Snapshot：统一输出本轮上下文健康快照。
2. SX2.5-2 TODO Handoff Pack：压缩策略后置任务清单自动化模板。

### 4) 风险与回滚策略

1. 监控接线异常时，回退到现有 budget + trace 基线。
2. 任一监控变更引发主链路回归时，优先保留主链路，降级为日志-only。

## WIP 执行门禁记录（必填）

执行规则：当进入“执行小步骤”或“讨论 wipxxx”时，若未完成门禁讨论，先补讨论再实现。
门禁新增要求：`为什么做 + 问题与边界` 为必填；未补齐不得从 `Pending` 进入 `In Progress`。

| WIP | 为什么做 + 问题与边界 | 超越目标 | 核心设计 | 验证Case/DoD | 风险回滚 | 状态 |
|---|---|---|---|---|---|---|
| `wip2_5-01` 对标与门禁基线 | Context 监控尚未单独建模，直接做压缩风险高 | 冻结“监控先行”边界并形成独立阶段 | 完成对标结论、WIP 门禁、里程碑与命令清单 | 文档可直接排期且门禁字段完整 | 不通过仅回退文档 | Pending |
| `wip2_5-02` Context usage 统一模型 | usage 来源分散，口径不一致 | 统一 usage 与阈值状态输出契约 | 新增 `context health` 模型与聚合入口 | `CTXM-001~004` 通过 | 回退现有统计路径 | Pending |
| `wip2_5-03` 告警与阻断事件 | warning/blocking 语义不统一 | 结构化事件与 reasonCode 一致化 | 新增 `context.warning/context.blocking` 事件 | `CTXM-005~008` 通过 | 降级为 trace info-only | Pending |
| `wip2_5-04` `/context` 视图对齐 | 命令输出与模型真实视图可能偏差 | 命令视图与 query 口径一致 | 统一命令输出层并明确数据源 | `CTXM-009~010` 通过 | 保留旧命令输出兜底 | Pending |
| `wip2_5-05` TODO 交接包（给 Extra） | 压缩策略后置，需防知识丢失 | 把压缩待办转成结构化 TODO 包 | 输出 `Compression TODO Pack`（设计/Case/风险） | `CTXM-011~012` 通过 | 仅回退 TODO 文档 | Pending |

## 阶段完成标准（DoD）

1. Context usage/threshold/blocking 语义统一并可测试。
2. `/context` 输出与 query 实际视图口径一致。
3. 形成可执行的压缩后置 TODO 清单，明确移交到 Phase Extra。
4. `build/type/lint/test` 全绿，且不引入前置阶段回归。
5. 完成主路线图与 Extra 阶段引用回写。

## 与 Phase Extra 的边界（共识冻结）

1. Phase 2.5 只做监控与信号，不做自动压缩策略。
2. 压缩相关工作（auto/reactive/collapse/overflow 编排）统一进入 Phase Extra。
3. Phase Extra 实施前必须消费 Phase 2.5 输出的 TODO 交接包。

## 建议验收命令（草案）

1. `bun run build`
2. `bunx tsc --noEmit`
3. `bun run lint`
4. `bun test src/__tests__/phase2_5*.test.ts`
5. `bun test src/__tests__/phase1*.test.ts src/__tests__/phase2*.test.ts`
