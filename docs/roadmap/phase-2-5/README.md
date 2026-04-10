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
| `wip2_5-06` System Prompt 缓存前缀对齐 | System Prompt 变化面过大，难以复用前缀缓存 | 固化“静态前缀在前、动态后缀在后”策略并显式化缓存块 | 拆分 prompt block 并定义 cache control 语义 | `CTXM-013~015` 通过 | 回退到单字符串 system prompt 方案 | Pending |

## 阶段完成标准（DoD）

1. Context usage/threshold/blocking 语义统一并可测试。
2. `/context` 输出与 query 实际视图口径一致。
3. 形成可执行的压缩后置 TODO 清单，明确移交到 Phase Extra。
4. `build/type/lint/test` 全绿，且不引入前置阶段回归。
5. 完成主路线图与 Extra 阶段引用回写。

## 工作包（Work Packages）

### WP2.5-A：Context usage 统一模型（对应 `wip2_5-02`）

- 目标：把 query 执行过程中的 context usage、阈值状态、来源标记统一成单一契约。
- 产出：
  - `src/application/query/context-health.ts`
  - `src/application/query/query-runner.ts`（接入 preflight/streaming/done 三段快照）
  - `src/__tests__/phase2_5_context_health.test.ts`
- 验收：同一轮对话在不同采样点输出一致语义（usage + threshold + source）。

#### WP2.5-A 设计核心（必须先达成共识）

1. 为什么做（Why）
- 当前 context budget 校验散落在 `query-runner.ts` 多处，阈值状态没有统一抽象，后续策略接入点不稳定。

2. 问题与边界
- In Scope：usage 快照模型、阈值判定函数、采样点统一。
- Out of Scope：自动压缩执行、overflow 恢复编排。

3. 核心设计
- 新增 `ContextHealthSnapshot`，最小字段：
  - `usage`：`context/input/output`
  - `limits`：`maxContext/maxInput/maxOutput`
  - `status`：`ok|warning|blocking`
  - `source`：`preflight|streaming|done`
  - `estimated`：各 token 是否估算
- 在 `runQuery` 三处生成快照：
  1. 流开始前（preflight）
  2. 文本增量阶段（streaming）
  3. provider done 阶段（done）
- warning 判定先固定阈值（例如 `>=80%`）并可配置；blocking 继续沿用 budget exceeded 语义。

4. 验证 Case（DoD）
- `CTXM-001` preflight 快照能稳定输出 `context usage + status`。
- `CTXM-002` streaming 快照与 done 快照字段一致，仅数值变化。
- `CTXM-003` provider usage 缺失时，`estimated` 标记正确。
- `CTXM-004` 同输入重复运行，阈值状态判定稳定可重复。

5. 风险与回滚
- 若快照模型引入误判，回退到现有 `evaluateBudget` 直判路径，并保留日志输出。

### WP2.5-B：告警与阻断事件（对应 `wip2_5-03`）

- 目标：统一 `context.warning/context.blocking` 事件语义与 reasonCode。
- 产出：
  - `src/application/query/context-events.ts`
  - `src/application/query/query-runner.ts`（发射 context 事件）
  - `src/observability/assertions.ts`（新增 context 事件语义断言）
  - `src/__tests__/phase2_5_context_events.test.ts`
- 验收：warning/blocking 事件均可回放，且 reasonCode 可断言。

#### WP2.5-B 设计核心（必须先达成共识）

1. 为什么做（Why）
- 当前 warning/blocking 事件判定与发射分散在 budget 判定和 trace 写入路径，reasonCode 语义不稳定，导致观测层无法做可靠断言。

2. 问题与边界
- In Scope：事件契约、reasonCode 枚举、去重策略、失败降级策略。
- Out of Scope：告警后的自动压缩动作、跨 turn 的恢复编排。

3. 核心设计
- 新增 `ContextSignalEvent` 统一载荷：
  - `eventType`：`context.warning | context.blocking`
  - `reasonCode`：`context_near_limit | context_limit_exceeded`
  - `metric/actual/limit/ratio/source/estimated`
  - `turnId/timestamp`
- 发射规则固定化：
  1. `ok -> warning` 状态跃迁时发射一次 `context.warning`
  2. 任一指标超限时立即发射 `context.blocking`
  3. 同 turn 同 metric 同 reasonCode 去重，避免事件风暴
- 观测写入采用 fail-open：assertion/trace 写入失败只记录 info，不影响 query 主链路。

4. 验证 Case（DoD）
- `CTXM-005` 逼近阈值时发射 `context.warning`，`reasonCode=context_near_limit`。
- `CTXM-006` 超限时发射 `context.blocking`，`reasonCode=context_limit_exceeded`。
- `CTXM-007` 事件 payload 含 `metric/limit/actual/ratio/source/estimated`。
- `CTXM-008` 观测写入失败不阻断主链路，降级为 trace info-only。

5. 风险与回滚
- 事件风暴风险通过“同 turn 同 metric 去重”控制；异常时关闭 context 事件发射，仅保留 budget stop。

### WP2.5-C：`/context` 视图对齐（对应 `wip2_5-04`）

- 目标：命令视图只消费 Context Health 模型，避免命令层重复计算。
- 产出：
  - `src/application/query/context-view.ts`
  - `src/cli/index.ts`（补充 context 视图入口）
  - `src/__tests__/phase2_5_context_view.test.ts`
- 验收：命令输出字段与 query 快照字段一一对应。

#### WP2.5-C 设计核心（必须先达成共识）

1. 为什么做（Why）
- `/context` 目前存在命令层二次推导风险，可能与 query 运行时快照不一致，排障时会出现“命令显示正常但实际已接近上限”的错觉。

2. 问题与边界
- In Scope：视图适配层、字段映射、无数据兜底格式。
- Out of Scope：命令交互改版、额外治理指标派生。

3. 核心设计
- 新增 `context-view` 适配器，仅消费 `ContextHealthSnapshot`，禁止命令层自行计算 ratio/status。
- `/context` 输出固定映射：
  - `status/source`
  - `usage.context/input/output`
  - `limits.maxContext/maxInput/maxOutput`
  - `estimated` 标记与最后更新时间
- 无快照场景输出结构化 `no_data` 响应（带建议动作），而非空字符串或异常堆栈。

4. 验证 Case（DoD）
- `CTXM-009` context 视图与 query 快照字段完全对齐（无额外推导字段）。
- `CTXM-010` 无 query 快照时命令返回结构化“无数据”提示，不崩溃。

5. 风险与回滚
- 命令入口改造异常时，保留旧输出兜底并标注“legacy view”。

### WP2.5-D：TODO 交接包（对应 `wip2_5-05`）

- 目标：把压缩策略后置任务转为可执行交接包，供 Phase Extra 直接消费。
- 产出：
  - `docs/roadmap/phase-2-5/compression-todo-pack.md`
  - `docs/roadmap/phase-extra/README.md`（补齐交接包引用）
  - `src/__tests__/phase2_5_handoff_pack.test.ts`（结构校验）
- 验收：交接包包含“策略清单、风险、Case 基线、回滚策略、准入条件”。

#### WP2.5-D 设计核心（必须先达成共识）

1. 为什么做（Why）
- 压缩策略明确后置到 Phase Extra，但若没有结构化交接包，容易在阶段切换时丢失约束与验证基线，导致 Extra 重复探索或越界实现。

2. 问题与边界
- In Scope：交接包模板、字段校验、Extra 引用回写。
- Out of Scope：任一压缩策略的直接编码实现。

3. 核心设计
- 交接包采用固定章节：
  1. `Entry Criteria`（必须具备的 Phase 2.5 输出）
  2. `Strategy Backlog`（auto/reactive/collapse/overflow 候选项）
  3. `Risk Register`（误压缩、抖动、误阻断）
  4. `Verification Baseline`（沿用 CTXM 编号与新增用例）
  5. `Rollback Plan`（策略级和系统级回退）
- 在 `phase-extra/README.md` 增加“先消费 TODO Pack 再实现”检查项，防止绕过门禁。
- 以测试校验 TODO Pack 字段完整性，避免仅靠人工审阅。

4. 验证 Case（DoD）
- `CTXM-011` TODO Pack 字段完整（策略/风险/Case/回滚/依赖）。
- `CTXM-012` Phase Extra 文档引用一致且具备“先消费后实现”检查项。

5. 风险与回滚
- 若交接包结构不稳定，先冻结最小字段模板，禁止直接推进 Phase Extra 实现。

### WP2.5-E：System Prompt 缓存前缀对齐（对应 `wip2_5-06`）

- 目标：把 System Prompt 组装策略升级为“稳定前缀优先、动态后缀后置”，以提升 API prompt cache 命中率。
- 产出：
  - `src/core/prompt.ts`（拆分静态/动态块并固定顺序）
  - `src/api/client.ts`（接入 system block 级 cache control）
  - `src/application/query/query-runner.ts`（统一传递新 prompt 结构）
  - `src/__tests__/phase2_5_prompt_cache_strategy.test.ts`
- 验收：不变内容位于前缀且在跨 turn 可复用，动态内容不污染缓存前缀。

#### WP2.5-E 设计核心（必须先达成共识）

1. 为什么做（Why）
- 当前 system prompt 以单字符串拼接，动态字段（如日期/运行态）可能位于前部，导致前缀不稳定，无法稳定利用 API 缓存机制。

2. 问题与边界
- In Scope：system prompt 分块、前后缀排序、cache control 标记、可测试组装策略。
- Out of Scope：模型路由策略、压缩算法、上下文检索策略改造。

3. 核心设计
- Prompt 组装改为 block 化并固定顺序：
  1. `Static Foundation`（角色、能力边界、稳定项目规则）
  2. `Stable Project Context`（CLAUDE.md、相对稳定记忆片段）
  3. `Dynamic Runtime Context`（时间、cwd、git 实时状态、回合态）
- 对前两段启用可缓存策略，对动态段标记为不缓存或短生命周期缓存，确保“稳定前缀最大化”。
- 明确约束：命令/调用层禁止把动态字段插入静态前缀块。

4. 验证 Case（DoD）
- `CTXM-013` 同会话多 turn 下，静态前缀字节级稳定（hash 一致）。
- `CTXM-014` 动态字段仅出现在后缀块，不影响前缀 hash。
- `CTXM-015` 关闭新策略时可回退到 legacy 单字符串组装，行为兼容。

5. 风险与回滚
- 若 provider/SDK cache control 兼容性不足，回退到“仅保留前后缀顺序优化，不启用显式 cache control”。

## 依赖与并行策略

1. 串行主链：`wip2_5-01 -> wip2_5-02 -> wip2_5-03 -> wip2_5-04 -> wip2_5-05 -> wip2_5-06`
2. 并行项：`wip2_5-03` 与 `wip2_5-04` 可在 `wip2_5-02` 快照契约冻结后并行推进；`wip2_5-06` 可在 `wip2_5-04` 冻结命令视图口径后启动。
3. 前置门：
- 进入实现前必须先完成 `wip2_5-01`（对标状态从 `Pending` 冻结为 `Completed`）。
- 任意 WIP 开始前需通过 `phase1_*` 与 `phase2_*` 前置回归集。

## 里程碑

1. M2.5-1（监控模型可运行）：完成 `wip2_5-02`
2. M2.5-2（事件与命令可对齐）：完成 `wip2_5-03 + wip2_5-04`
3. M2.5-3（可交接到 Extra）：完成 `wip2_5-05`
4. M2.5-4（提示词缓存策略可验证）：完成 `wip2_5-06`

## 与 Phase Extra 的边界（共识冻结）

1. Phase 2.5 只做监控与信号，不做自动压缩策略。
2. 压缩相关工作（auto/reactive/collapse/overflow 编排）统一进入 Phase Extra。
3. Phase Extra 实施前必须消费 Phase 2.5 输出的 TODO 交接包。

## 建议验收命令（草案）

1. `bun run build`
2. `bunx tsc --noEmit`
3. `bun run lint`
4. `bun test src/__tests__/phase2_5_context_health.test.ts src/__tests__/phase2_5_context_events.test.ts src/__tests__/phase2_5_context_view.test.ts src/__tests__/phase2_5_handoff_pack.test.ts`
5. `bun test src/__tests__/phase2_5_prompt_cache_strategy.test.ts`
6. `bun test src/__tests__/phase1*.test.ts src/__tests__/phase2*.test.ts`
