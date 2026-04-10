# Phase 1 - Query Engine v2

- Status: In Progress
- Updated: 2026-04-09

## 启动前对标结论（已初始化）

- 对标状态: In Progress
- 对标日期: 2026-04-09
- 对标范围: Query Engine / Streaming / Transcript / Error Recovery
- 参考源码:
  - `claude-code-run/src/core/query.ts`
  - `claude-code-run/src/api/*`
  - `claude-code-run/src/state/*`

### 基线结论（2026-04-09）

1. 已对齐项:
- 已具备流式事件消费、工具调用递归多轮主链路
- 已具备最小 turn/query/provider trace 事件
- 已具备 token usage 累计展示能力
2. 差异项:
- 能力覆盖: 缺失显式 turn 状态机和迁移约束
- 稳定性: 缺失可恢复中断路径与统一重试策略
- 可观测性: trace 与 query 状态语义尚未一一对齐
- 安全边界: 错误分类粗粒度，恢复分支不可控
- 复杂度: `core/query.ts` 单函数承担过多职责
3. 本阶段范围:
- In Scope: 状态机、预算、恢复、transcript 最小实现
- Out of Scope: 多 Provider、完整编排平面、MCP/Plugin 接入

## 目标

把 Query 引擎从“可跑”升级为“可持续”，并形成可验证、可回放、可恢复的最小治理闭环。

## 超越基线讨论（新增）

> 原则：对标源码只定义“底线”，不定义“上限”。
> Phase 1 不是“复刻 Query”，而是建立未来可扩展、可恢复、可优化的主脑底座。

### 1) 超越方向（而非仅对齐）

1. 可恢复性优先：从“报错即失败”升级为“可判定、可恢复、可回放”。
2. 长会话治理优先：把 budget 从展示指标升级为运行时控制面。
3. 可观测性闭环：trace 不只是日志，而是可用于断言状态机正确性的证据。
4. 演进友好性：通过状态机和分层模块，把后续 Phase 2/3/4 的接入成本降到最低。

### 2) 超越指标（Phase 1 即开始采样）

1. 恢复成功率：可恢复错误中，自动恢复成功占比（目标逐步 >= 70%）。
2. 回放可复原率：turn 主链路可从 transcript 复原的占比（目标 100%）。
3. 非法状态迁移数：状态机运行中出现非法迁移次数（目标 0）。
4. 长会话稳定性：20+ 轮后无卡死/无状态泄漏（目标 100% 通过）。

### 3) 创新工作轨（与主交付并行）

1. SX1 - Deterministic Turn Journal（确定性回合日志）
- 让 transcript 从“记录结果”升级为“恢复依据”，为后续断点续跑打基础。
2. SX2 - Budget Policy Engine（预算策略引擎）
- 先支持单策略，接口预留多策略（stop/truncate/compact）以支撑后续自适应治理。
3. SX3 - Recovery Policy Matrix（恢复策略矩阵）
- 每类错误绑定明确恢复动作，避免散落 `try/catch` 导致的行为漂移。

### 4) 与工作包映射

1. `WP1-C` 对应 SX2（budget 从指标变成控制）
2. `WP1-D` 对应 SX3（错误分类与恢复动作绑定）
3. `WP1-E` + `WP1-F` 对应 SX1（可回放 + 状态机证据）

## WIP 执行门禁记录（必填）

执行规则：当进入“执行小步骤”或“讨论 wipxxx”时，若未完成门禁讨论，先补讨论再实现。
门禁新增要求：`问题与边界` 必须包含 `为什么做（Why）`，否则视为门禁未通过。

| WIP | 为什么做 + 问题与边界 | 超越目标 | 核心设计 | 验证Case/DoD | 风险回滚 | 状态 |
|---|---|---|---|---|---|---|
| `wip1-a` | 已补充（见 WP1-A 设计核心） | 已补充（恢复性/可观测性） | 已补充（状态/迁移/不变式） | 已补充（TSM-001~016） | 已补充（保留兼容入口、迁移失败可阻断、增量接线可回退） | In Progress |
| `wip1-b` | 已补充（仅拆职责，不改外部行为） | 已补充（复杂度下降、可测性提升） | 已补充（runner/consumer/orchestrator 分层） | 已补充（新增 phase1_query_engine + 现有回归） | 已补充（先抽函数后迁文件，保留 legacy 入口） | Planned |
| `wip1-c` | 已补充（token/context 回合级预算） | 已补充（从“统计指标”升级为“执行控制”） | 已补充（preflight + streaming + done 三段 guard） | 已补充（BGT-001~005） | 已补充（stop-only 策略，单点回滚 query-runner 接线） | In Progress |
| `wip1-d` | 已补充（统一错误语义，不在 WP1-D 引入复杂自动编排） | 已补充（错误从“散落异常”升级为“状态机可判定动作”） | 已补充（`errors.ts` 分类 + `recovery.ts` 动作矩阵 + 明确 stop/retry/fatal） | 待补充（DREC-001~008） | 已补充（先保守矩阵，复杂恢复下沉至 `wip1-h`） | In Progress |
| `wip1-f` | 已补充（trace 已有迁移事件，但缺少语义断言，需防“有事件但语义错”） | 已补充（迁移证据从“可见”升级为“可断言”） | 已补充（`turn_transition` 锚点、合法迁移与终态对齐规则） | 已补充（FTR-001~005 + FTR-E2E-001~003） | 已补充（`dropped_events>0` 时降级跳过严格链路断言） | Done |
| `wip1-h` | 已补充（见 WP1-H 设计核心 Why/边界） | 已补充（恢复路径从“可跑”升级为“可验证稳定”） | 已补充（错误子类、分层重试、幂等保护、恢复可观测） | 已补充（RHD-001~010） | 已补充（非 M4 阻塞，拆分增量落地，可顺延但必须先于 Phase 2 大规模扩展） | In Progress |

## 阶段完成标准（DoD）

1. `turn` 生命周期由显式状态机驱动，非法迁移可检测
2. 超预算路径可控（context/token），且有统一降级动作
3. API/Tool/Permission/Network 错误可分类并进入明确恢复分支
4. transcript 能复原每轮 `input -> tool_use/tool_result -> output` 主链路
5. `build/type/lint/test` 全绿，且通过 20+ 轮会话稳定性回放

## 工作包（Work Packages）

### WP1-A：Turn 状态机定义与落地

- 目标：定义 QueryTurnState 与迁移表，替换隐式布尔流转
- 产出：
  - `src/application/query/turn-state.ts`（状态与迁移）
  - `src/state/store.ts`（最小状态字段补充）
  - `src/architecture/contracts/query-engine.ts`（必要元数据对齐）
- 验收：
  - 非法迁移触发错误事件并阻断
  - 单元测试覆盖正常链路和异常链路

#### WP1-A 设计核心（必须先达成共识）

1. 要解决的问题（Problem Statement）
- 当前 `core/query.ts` 以局部变量 + 递归控制流程，状态语义隐式，难以验证。
- 工具调用、权限确认、错误恢复混在同一主循环，边界不清晰，回归风险高。
- 中断/超时/错误等异常路径没有统一迁移规则，导致行为不可预测。
- trace 事件存在，但未与“状态迁移”绑定，难以判断流程正确性。

2. 状态机必须具备的核心能力（Capabilities）
- 显式状态：每个 turn 在任一时刻只有一个主状态。
- 迁移守卫：所有状态迁移都走统一 `transition(from, event) -> to` 判定。
- 异常收敛：可恢复错误统一进入 `recovering`，不可恢复错误统一进入 `stopped`。
- 终态可解释：`stopped` 必须携带停止原因（如完成/取消/预算/致命错误）。
- 可观测联动：每次迁移都产出 trace 事件（from/to/event/reason）。
- 可测试：非法迁移、恢复成功/失败、用户中断都可通过单测稳定复现。

3. V1 建议状态集（Phase 1）
- `idle`：空闲，等待 turn 启动。
- `streaming`：模型流式输出中。
- `awaiting-permission`：等待用户授权（`ask` 模式）。
- `tool-running`：工具执行中。
- `recovering`：执行重试/恢复策略中。
- `stopped`：turn 结束（终态）。

4. V1 建议迁移主链
- `idle -> streaming`：启动 turn。
- `streaming -> awaiting-permission`：收到 tool_use 且需授权。
- `streaming -> tool-running`：收到 tool_use 且可直接执行。
- `awaiting-permission -> tool-running`：授权通过。
- `awaiting-permission -> stopped`：授权拒绝。
- `tool-running -> streaming`：tool_result 回写完成，继续模型推理。
- `streaming/tool-running -> recovering`：出现可恢复错误。
- `recovering -> streaming`：恢复成功并重试。
- `recovering -> stopped`：恢复失败或重试耗尽。
- `streaming -> stopped`：assistant 正常完成。
- `* -> stopped`：用户中断、预算触发、致命错误。

5. 状态机不变式（Invariants）
- `stopped` 为终态，禁止再迁移。
- 任一时刻只允许一个 active turn（`currentTurnId` 与状态一致）。
- 只有 `tool-running` 状态允许写入 `tool_result`。
- 每次迁移都必须可在 trace 中回放到（防“无痕状态跳变”）。

6. 与后续工作包的耦合关系
- `WP1-B` 依赖状态机提供稳定执行骨架。
- `WP1-C` 的 budget 触发动作落在 `* -> stopped` 或 `* -> recovering`。
- `WP1-D` 的错误恢复矩阵直接驱动 `-> recovering / -> stopped` 判定。
- `WP1-F` 负责验证“迁移即事件”是否成立。

#### WP1-A 验证说明（具体 Case）

> 目标：让“是否完成 WP1-A”可直接通过测试结果判断，而不是靠主观描述。

1. 建议测试文件
- `src/__tests__/phase1_turn_state_machine.test.ts`（状态迁移单测）
- `src/__tests__/phase1_query_state_integration.test.ts`（query 集成态校验，可后置）

2. 必测用例清单（最小集合）

| Case ID | 场景 | Given | When | Then |
|---|---|---|---|---|
| `TSM-001` | 启动回合 | `idle` | `turn_start` | 迁移到 `streaming` |
| `TSM-002` | 自动工具执行 | `streaming` | `tool_use_detected(auto)` | 迁移到 `tool-running` |
| `TSM-003` | 需授权工具执行 | `streaming` | `tool_use_detected(ask)` | 迁移到 `awaiting-permission` |
| `TSM-004` | 授权通过 | `awaiting-permission` | `permission_approved` | 迁移到 `tool-running` |
| `TSM-005` | 授权拒绝 | `awaiting-permission` | `permission_denied` | 迁移到 `stopped`，reason=`permission_denied` |
| `TSM-006` | 工具执行完成 | `tool-running` | `tool_result_written` | 迁移到 `streaming` |
| `TSM-007` | 正常完成 | `streaming` | `assistant_done` | 迁移到 `stopped`，reason=`completed` |
| `TSM-008` | 可恢复错误进入恢复态 | `streaming` 或 `tool-running` | `recoverable_error` | 迁移到 `recovering` |
| `TSM-009` | 恢复成功 | `recovering` | `recovery_succeeded` | 迁移到 `streaming` |
| `TSM-010` | 恢复失败 | `recovering` | `recovery_failed`/`retry_exhausted` | 迁移到 `stopped`，reason=`recovery_failed` |
| `TSM-011` | 用户中断 | 任意非终态 | `user_cancelled` | 迁移到 `stopped`，reason=`cancelled` |
| `TSM-012` | 预算触发停止 | 任意非终态 | `budget_exceeded` | 迁移到 `stopped`，reason=`budget_exceeded` |
| `TSM-013` | 非法迁移阻断 | `idle` | `tool_use_detected` | 抛出非法迁移错误，不改变状态 |
| `TSM-014` | 终态不可迁移 | `stopped` | 任意事件 | 抛出非法迁移错误，不改变状态 |
| `TSM-015` | 单活跃 turn 不变式 | 两个并发 turn 请求 | 第二个 `turn_start` | 被拒绝或排队，不出现双 active turn |
| `TSM-016` | 迁移事件可观测 | 任意合法迁移 | 触发迁移 | trace 记录 `from/to/event/reason` |

3. 完成判定（Definition of Done for WP1-A）

1. `TSM-001 ~ TSM-016` 全部通过。
2. 每个“合法迁移”至少有 1 个正向 case；每个关键非法迁移至少有 1 个反向 case。
3. `stopped` 终态规则和 `single active turn` 不变式均有独立测试。
4. 关键迁移（启动、工具、恢复、结束）都能在 trace 回放中看到对应迁移事件。

4. 建议执行命令

1. `bun test src/__tests__/phase1_turn_state_machine.test.ts`
2. `bun test src/__tests__/phase1_query_state_integration.test.ts`（实现后）
3. `bun test`

### WP1-B：Query 主循环职责拆分

- 目标：将 `core/query.ts` 拆分为事件消费、工具编排、收尾阶段
- 产出：
  - `src/application/query/` 下的分层执行模块
  - `src/core/query.ts` 保留兼容入口或轻量适配器
- 验收：
  - 与现有输入输出行为兼容
  - `query-formatting` 与 Phase 2/3/4 现有测试无回归

#### WP1-B 设计核心（必须先达成共识）

1. 要解决的问题（Problem Statement）
- 当前 `core/query.ts` 同时承担 turn 生命周期、provider 事件消费、tool 编排与收尾，职责耦合过重。
- 状态迁移虽已接入（WP1-A），但执行骨架仍是单函数，后续接入 budget/recovery/transcript 风险高。
- 关键路径（tool 递归续跑、权限拒绝、异常收尾）缺少模块级边界，难以做聚焦测试。

2. 模块能力与边界（Capabilities & Boundaries）
- `query-runner`：统一管理 turn 起止、trace 边界、状态复位、异常收敛。
- `stream-consumer`：仅负责消费 provider stream event 并驱动内部动作，不直接做复杂编排决策。
- `tool-orchestrator`：负责 `tool_use/tool_result` 写回、权限分支、递归续跑触发。
- `core/query.ts`：仅保留兼容入口与轻量适配，不承载业务分支。

3. 约束与不变式（Invariants）
- 外部行为不变：`query(store, options)` 调用方式和可见输出语义保持兼容。
- 递归续跑语义不变：tool 完成后仍通过同一主链路继续 query。
- 终止收敛不变：无论正常结束或异常，最终都能进入统一收尾（streaming stop + 状态复位）。
- 状态迁移证据不变：`WP1-A` 的 `turn_transition` 事件链不能丢失。

4. 与后续工作包耦合关系
- `WP1-C` 预算检查将挂在 `query-runner` 的统一执行骨架中。
- `WP1-D` 错误分类与恢复策略将注入 `stream-consumer`/`tool-orchestrator` 分支点。
- `WP1-E/F` transcript 与 trace 对齐依赖 `stream-consumer` 的稳定事件抽象。

#### WP1-B 验证说明（具体 Case）

1. 建议测试文件
- `src/__tests__/phase1_query_engine.test.ts`（WP1-B 新增）
- `src/__tests__/query-formatting.test.ts`（已有回归）
- `src/__tests__/phase1_turn_state_machine.test.ts`（已有回归）
- `src/__tests__/phase1_query_state_integration.test.ts`（已有回归）

2. 必测用例清单（最小集合）

| Case ID | 场景 | Given | When | Then |
|---|---|---|---|---|
| `QENG-001` | 无工具正常结束 | provider 只产出 text+done | 执行 query | 追加 assistant 消息，turn 收敛到 `stopped(completed)`，最终复位 `idle` |
| `QENG-002` | 自动工具递归续跑 | provider 产出 `tool_use(auto)` | tool 执行成功并返回 | 写入 `tool_use/tool_result` 后触发续跑，状态回到 `streaming` |
| `QENG-003` | 授权拒绝终止 | permissionMode=`ask` | tool 被拒绝 | query 停止并设置错误，turn 收敛为 `stopped(permission_denied)` |
| `QENG-004` | 异常统一收尾 | provider 或 tool 抛错 | 执行 query | 记录错误并进入统一收尾，不遗留 streaming 状态 |
| `QENG-005` | 迁移事件完整 | 任一主链路场景 | 执行 query | trace 中可见关键 `turn_transition` 序列，无断链 |

3. 完成判定（Definition of Done for WP1-B）

1. `QENG-001 ~ QENG-005` 全部通过。
2. `query-formatting`、`phase1_turn_state_machine`、`phase1_query_state_integration` 无回归。
3. `core/query.ts` 复杂分支迁移到 `src/application/query/`，入口文件保留薄适配职责。
4. 若行为偏差出现，可在单次提交内回退到兼容路径（保留 `legacyQueryEngine`）。

4. 建议执行命令

1. `bun test src/__tests__/phase1_query_engine.test.ts`
2. `bun test src/__tests__/query-formatting.test.ts`
3. `bun test src/__tests__/phase1_turn_state_machine.test.ts src/__tests__/phase1_query_state_integration.test.ts`

### WP1-C：Budget Guard（token/context）

- 目标：落地回合预算检查和最小降级策略
- 产出：
  - `src/application/query/budget.ts`
  - `QueryOptions.budget` 实际接线
  - 超预算处理策略（当前为 `stop-only`）
- 验收：
  - 预算边界可测试
  - 超预算行为可预测且可观测（有 trace 记录）

#### WP1-C 设计核心（已实现）

1. Guard 插入点
   - preflight：在 provider stream 启动前检查 `maxContextTokens`（估算）。
   - streaming：每次 `text` chunk 后检查 `maxOutputTokens`（估算）。
   - done：收到 provider `done` 后检查 `maxInputTokens/maxOutputTokens`（优先用 provider tokens，无则估算）。
2. 统一停止动作
   - 触发状态迁移：`budget_exceeded -> stopped(budget_exceeded)`。
   - 设置用户可见错误：`Budget exceeded: ...`。
   - 记录 trace：`stage=query,event=budget_exceeded`，附带 `metric/limit/actual/estimated`。
3. 首版策略约束
   - 仅做 stop-only，不做自动截断与重试，避免在 WP1-C 引入多分支行为不确定性。

#### WP1-C 验证说明（具体 Case）

- `src/__tests__/phase1_budget_guard.test.ts`
  - `BGT-001` budget 未配置时不触发拦截。
  - `BGT-002` `maxContextTokens` 可触发超预算。
  - `BGT-003` `maxOutputTokens` 超限时错误文案可预测。
  - `BGT-004` `onTextChunk` 返回 `stopped` 时主循环可提前停止。
  - `BGT-005` `onDone` 返回 `stopped` 时主循环可提前停止。

#### WP1-C 建议执行命令

1. `bun test src/__tests__/phase1_budget_guard.test.ts`
2. `bun test src/__tests__/phase1_query_engine.test.ts`

### WP1-D：错误分类与恢复矩阵

- 目标：统一错误语义并映射恢复动作
- 产出：
  - `src/application/query/errors.ts`
  - `src/application/query/recovery.ts`
  - 错误类型到恢复动作映射表
- 验收：
  - API/Tool/Permission/Network 至少四大类错误可区分
  - 中断/重试/终止路径有明确判定规则

#### WP1-D 设计核心（必须先达成共识）

0. 为什么做（Why）
- 当前错误路径主要是散落 `try/catch` 与兜底 `fatal_error`，行为可运行但不可预测，难以复盘。
- WP1-D 的价值不是“增加更多功能”，而是把错误处理从“实现细节”升级为“可判定策略”。
- 只有先把“错误分类 -> 恢复动作 -> 状态机事件”绑定起来，后续 transcript/trace 与稳定性门禁才有一致口径。

1. 边界
- WP1-D 只做“分类与动作绑定”，不做跨会话恢复、复杂交互式恢复、自动降级编排。
- 任何恢复动作都必须能映射到状态机事件：`recoverable_error` / `retry_exhausted` / `fatal_error` / `permission_denied`。

2. V1 错误分类与动作矩阵（保守策略）

| 错误类别 | 示例 | 默认动作 | 状态机事件 |
|---|---|---|---|
| `permission_denied` | 用户拒绝工具执行 | 立即停止 | `permission_denied` |
| `budget_exceeded` | context/output 超预算 | 立即停止 | `budget_exceeded` |
| `network_transient` | 连接超时、临时网络抖动 | 进入恢复，最多重试 2 次 | `recoverable_error`，失败后 `retry_exhausted` |
| `provider_rate_limited` | 上游限流 | 进入恢复，退避重试 1-2 次 | `recoverable_error`，失败后 `retry_exhausted` |
| `tool_transient` | 工具临时 IO/网络失败 | 进入恢复，最多重试 1 次 | `recoverable_error`，失败后 `retry_exhausted` |
| `non_recoverable` | 非法请求、协议/状态不一致、代码错误 | 立即终止 | `fatal_error` |

3. 恢复原则
- 默认保守：无法明确判定可恢复时，按 `non_recoverable` 处理。
- 重试有预算：预算耗尽后统一收敛到 `retry_exhausted -> stopped(recovery_failed)`。
- 结果可解释：每次分类和恢复决策都要产出 trace 证据（错误类别、动作、attempt）。

#### WP1-D 验证说明（具体 Case）

- `src/__tests__/phase1_recovery_matrix.test.ts`（WP1-D 新增，建议）
  - `DREC-001` permission denied 分类准确并终止。
  - `DREC-002` budget exceeded 分类准确并终止。
  - `DREC-003` network transient 进入 recovering 并在预算内可恢复。
  - `DREC-004` network transient 超出预算后触发 `retry_exhausted`。
  - `DREC-005` provider rate limit 按退避重试并可收敛。
  - `DREC-006` tool transient 只允许单次重试，失败后终止。
  - `DREC-007` non recoverable 直接 `fatal_error`。
  - `DREC-008` 恢复链路 trace 字段包含 `error_class/action/attempt`。

#### WP1-D 建议执行命令

1. `bun test src/__tests__/phase1_recovery_matrix.test.ts`
2. `bun test src/__tests__/phase1_query_engine.test.ts`

### WP1-E：最小 Transcript 持久化与读取

- 目标：session 级 jsonl transcript，支持人工回放核对
- 产出：
  - `src/application/query/transcript/`（writer/reader/model）
  - [docs/transcript-model.md](../../transcript-model.md)（事件字段与约束）
- 验收：
  - 每轮记录 user/assistant 最终可见内容
  - 记录 `tool_use` 与 `tool_result` 关联
  - 可读取并复原主链路

#### WP1-E 设计核心（必须先达成共识）

0. 为什么做（Why）
- 当前链路已经有 trace，但 trace 面向执行诊断，不等价于“用户可核对的会话事实”。
- 若不先定义 transcript 语义边界，后续会出现 transcript/trace 双模重复建模，导致字段漂移与回放口径不一致。
- WP1-E 的目标不是做“全量事件存档系统”，而是先建立最小可复原主链路（`input -> tool_use/tool_result -> output`）的事实账本。

1. 作用域与边界（Scope）
- In Scope：
  - session 级 JSONL 持久化；
  - 记录消息追加事实（user/assistant/tool 链路）；
  - 提供最小 reader，把事件还原为 turn 主链路。
- Out of Scope：
  - 跨会话恢复编排、断点续跑；
  - transcript 驱动业务重放执行；
  - 与外部遥测平台打通（OTel/exporter）。

2. 最小事件模型（V1）
- 建议只定义三类事件，避免首版过拟合：
  - `session_start`：会话元数据（`session_id/trace_id/model/cwd`）。
  - `message_append`：消息写入事实（`turn_id/message_id/role/content/is_tool_result`）。
  - `session_end`：会话结束元数据（`reason/duration_ms`，无则可选）。
- 约束：
  - transcript 不记录流式增量 chunk，只记录“最终追加消息”。
  - `tool_use` 与 `tool_result` 关联必须依赖现有字段：`tool_use.id <-> tool_result.tool_use_id`。
  - 事件必须单调追加（append-only），不允许原地改写历史记录。

3. 写入时机与一致性（Write Semantics）
- 单一写入入口：优先挂在 `state.addMessage(...)` 路径，避免 query/tool 分支重复写入。
- 写入策略：
  - best-effort 异步写盘，失败不阻塞主执行；
  - 写入失败必须可见（stderr/trace error）；
  - 同一进程内保证顺序写入（队列串行）。
- 可见性规则：
  - `isToolResult !== true` 视为用户可见消息；
  - `isToolResult === true` 视为内部链路证据（仍需落盘用于复原 tool 链路）。

4. 回放规则（Replay Semantics）
- reader 最小能力：读取 JSONL -> 校验事件 -> 聚合为 turn 链路。
- turn 复原口径：
  - 输入：该 turn 的 user 可见消息；
  - 中间：tool_use/tool_result 关联链；
  - 输出：assistant 可见最终消息。
- 若存在不完整链路（如缺失 tool_result），reader 要给出“部分可复原”标记而不是静默吞掉。

5. 与 Trace 的最小差异原则（必须遵守）
- trace 回答“执行发生了什么”；transcript 回答“会话可核对事实是什么”。
- transcript 不复制 trace 的 span/priority/status 等诊断字段，只保留必要关联键（`session_id/trace_id/turn_id`）。
- Phase 1 内禁止把 transcript 扩展为第二套 observability 系统。

6. 与后续工作包耦合关系
- `WP1-F` 将基于 transcript + trace 双回放验证“状态迁移证据”和“会话事实证据”是否一致。
- `WP1-G` 会把 transcript 读取与主链路复原纳入回归门。
- `WP1-H` 允许增强恢复事件，但不能破坏 `WP1-E` 的 V1 事件兼容性。

#### WP1-E 验证说明（具体 Case）

1. 建议测试文件
- `src/__tests__/phase1_transcript_model.test.ts`（模型与约束）
- `src/__tests__/phase1_transcript_io.test.ts`（写入/读取）
- `src/__tests__/phase1_transcript_replay.test.ts`（主链路复原）

2. 必测用例清单（最小集合）

| Case ID | 场景 | Given | When | Then |
|---|---|---|---|---|
| `TRC-001` | 可见消息落盘 | user + assistant 正常对话 | 发生 `addMessage` | transcript 有对应 `message_append` 记录 |
| `TRC-002` | 工具链路落盘 | assistant `tool_use` + user `tool_result` | 执行工具续跑 | transcript 中两者可通过 `tool_use_id` 关联 |
| `TRC-003` | 回放主链路 | 包含输入/工具/输出的一轮会话 | reader 聚合 | 可复原 `input -> tool -> output` |
| `TRC-004` | 不完整链路标记 | 缺失 `tool_result` 的异常片段 | reader 聚合 | 返回“部分可复原”并标记缺口 |
| `TRC-005` | 写入失败降级 | 写盘异常（权限/IO） | 执行 query | 主流程不中断，错误可观测 |
| `TRC-006` | trace/transcript 关联键 | 任意正常回合 | 写入并读取 | `session_id/trace_id/turn_id` 可用于双链路对齐 |

3. 完成判定（Definition of Done for WP1-E）

1. `TRC-001 ~ TRC-006` 全部通过。
2. 文档 [docs/transcript-model.md](../../transcript-model.md) 明确字段、约束和回放口径。
3. transcript 能稳定复原最小主链路：`input -> tool_use/tool_result -> output`。
4. 明确与 trace 的职责边界，无字段语义重叠造成的双源冲突。

#### WP1-E 建议执行命令

1. `bun test src/__tests__/phase1_transcript_model.test.ts`
2. `bun test src/__tests__/phase1_transcript_io.test.ts`
3. `bun test src/__tests__/phase1_transcript_replay.test.ts`
4. `bun test src/__tests__/phase1_query_engine.test.ts src/__tests__/phase1_query_state_integration.test.ts`

### WP1-F：Trace 与状态机语义对齐

- 目标：把 trace 关键事件锚定到状态迁移点
- 产出：
  - `src/observability/*` 中新增或调整状态迁移事件
  - `src/observability/assertions.ts` 断言规则更新
- 验收：
  - turn 级回放可验证状态迁移完整性
  - 无 orphan 事件回归

#### WP1-F 设计核心（必须先达成共识）

0. 为什么做（Why）
- 目前 `turn_transition` 已可写入 trace，但还没有被纳入统一断言，导致“有事件”不等于“语义正确”。
- 若不在 Phase 1 内完成语义对齐，`WP1-E` 的 transcript 回放与 trace 诊断会形成两套口径，后续回归成本会放大。
- WP1-F 的核心价值是把“迁移即事件”从约定升级为可验证事实，为 M3（可回放可核对）提供证据闭环。

1. 问题与边界（Scope）
- In Scope：
  - 将状态机迁移链纳入 trace 断言体系；
  - 校验关键迁移点与 turn 生命周期事件的一致性；
  - 提供 turn 级可复盘失败信息（断链点、缺口类型）。
- Out of Scope：
  - 不改动状态机状态集合与业务语义；
  - 不新增 transcript 事件类型；
  - 不引入外部遥测平台集成。

2. 核心设计（已落地）
- 断言入口：`validateTraceEvents()` 增加 `assertTurnTransitionSemantics()`。
- 规则层：
  - 合法迁移规则：按 `event/from/to/reason` 校验（如 `assistant_done => streaming->stopped(completed)`）。
  - 迁移链连续性：同一 `turn_id` 满足 `prev.to === next.from`，禁止 `stopped` 后继续迁移。
  - 生命周期锚点：`turn.start` 必须锚定首个 `turn_transition(turn_start)`；`turn.end|turn.error` 必须锚定 `to=stopped` 的终态迁移。
- 降级策略：若 trace 出现 `metrics.dropped_events > 0`，跳过严格迁移链断言，避免队列丢事件造成误报。

3. 验证 Case / DoD（FTR）
- `FTR-001` 合法迁移链通过。
- `FTR-002` 缺失 `turn_start` 锚点失败。
- `FTR-003` 迁移链断裂（`prev.to != next.from`）失败。
- `FTR-004` `turn.end|turn.error` 与终态 reason 不一致失败。
- `FTR-005` 有 `dropped_events` 信号时触发降级，避免严格断言误报。

完成判定：
1. `FTR-001~005` 全部通过。
2. 现有 `phase0_1_observability` 回归通过（兼容旧断言）。
3. [docs/trace-model.md](../../trace-model.md) 同步更新 `turn_transition` 断言语义。

4. 风险与回滚
- 风险：严格断言可能在高压丢事件场景误判失败。
- 回滚策略：
  - 首选：保留规则但在 `dropped_events > 0` 场景自动降级；
  - 兜底：若线上仍有噪声，可临时关闭 `assertTurnTransitionSemantics()` 调用，保留 Phase 0.1 断言集。

#### WP1-F 执行清单状态（更新 / 2026-04-10）

1. 已接入“真实 trace 文件回放断言”命令
- 目标：把 `validateTraceFile()` 从测试能力升级为可执行门禁命令。
- 变更点：新增 `scripts/trace-assert.ts`，并在 `package.json` 增加 `trace:assert` 脚本。
- 验收：`bun run trace:assert .trace/trace.jsonl` 非 0 退出可阻断流程。

2. 已增加端到端 FTR（非合成事件）
- 目标：覆盖“真实运行 -> trace 落盘 -> 回放断言”全链路。
- 变更点：新增 `src/__tests__/phase1_trace_transition_e2e.test.ts`。
- 验收：至少覆盖正常完成、工具续跑、错误终止 3 条链路。

3. 已将 WP1-F 门禁并入 Phase 1 验收命令
- 目标：避免只跑单测不跑回放校验。
- 变更点：补充本文件与 [docs/roadmap/master-roadmap.md](../master-roadmap.md) 的命令列表。
- 建议命令：
  - `bun test src/__tests__/phase1_trace_transition_assertions.test.ts`
  - `bun test src/__tests__/phase1_trace_transition_e2e.test.ts`
  - `bun run trace:assert .trace/trace.jsonl`

4. 上下文不足时的防幻觉执行约束
- 只允许基于以下文件推进：
  - `src/observability/assertions.ts`
  - `src/observability/replay.ts`
  - `src/state/store.ts`
  - `src/application/query/turn-state.ts`
  - `src/application/query/query-runner.ts`
- 每次继续前先执行：
  - `rg -n "turn_transition|validateTraceEvents|dropped_events" src docs -S`
  - `bun test src/__tests__/phase0_1_observability.test.ts src/__tests__/phase1_trace_transition_assertions.test.ts`
- 若上述两步任何一项不通过，禁止继续扩展功能，先修复基线再推进。

### WP1-G：验证门与回归用例补齐

- 目标：补齐 Phase 1 增量测试与门禁命令
- 产出：
  - `src/__tests__/phase1_query_engine.test.ts`（新增）
  - 回归脚本或文档化手动验收步骤
- 验收：
  - `bun run build`
  - `bunx tsc --noEmit`
  - `bun run lint`
  - `bun test`
  - 20+ 轮会话稳定性检查（脚本或手动记录）

### WP1-H：Recovery Hardening（Phase 1 收尾硬化）

- 目标：在不扩展产品能力的前提下，提升错误恢复的可靠性与可观测性
- 范围冻结：
  - In Scope: 错误子类细化、分层重试策略、工具重试幂等保护、恢复链路 trace/断言补齐
  - Out of Scope: 新 Provider 能力、跨会话自动续跑、复杂交互式恢复编排
- 执行约束：
  - 非 M4 阻塞：不阻塞 Phase 1 主验收与回对标结论
  - 前置门要求：阻塞 Phase 2 大规模能力扩展（必须先完成或明确豁免）
- 产出：
  - `src/application/query/errors.ts`（细粒度错误分类）
  - `src/application/query/recovery.ts`（恢复动作执行与重试预算）
  - `src/observability/*`（恢复事件补齐）
  - `src/__tests__/phase1_recovery_hardening.test.ts`（建议新增）
- 验收（草案）：
  - 可恢复错误具备按类型重试预算与终止条件
  - 工具重试具备最小幂等保障（避免重复副作用）
  - 恢复事件可用于回放诊断（attempt/success/fail 可追踪）

#### WP1-H 设计核心（必须先达成共识）

0. 为什么做（Why）
- 当前 `WP1-D` 已建立基础恢复矩阵，但仍偏“粗粒度 + 单层重试”，能跑通但在边界场景下稳定性不足。
- 现有工具重试没有显式幂等保护，遇到“带副作用”的工具失败重试时，存在重复执行风险。
- `WP1-H` 的目标不是扩能力，而是把“恢复可用”升级为“恢复可证明稳定”，为 Phase 2 扩展提供前置安全门。

1. 问题与边界（Scope）
- In Scope：
  - 在现有错误大类下补充子类语义（保持向后兼容）。
  - 建立分层重试策略（provider/tool 分层预算与退避）。
  - 增加工具重试幂等保护（可重试/不可重试判定）。
  - 增强恢复 trace 事件和断言，支持回放诊断。
- Out of Scope：
  - 新 provider 能力接入或协议升级。
  - 跨会话自动恢复、断点续跑编排。
  - 引入复杂交互式恢复流程（人工多轮确认编排）。

2. 核心设计（V1.5，增量式）
- 错误子类细化（`errors.ts`）：
  - 在不破坏 `QueryErrorClass` 主类兼容的前提下，补充 `subclass`（如 `timeout`/`rate_limit`/`tool_io`/`tool_side_effect_risk`）。
  - 若无法确定子类，降级为主类默认子类 `unknown_subclass`，避免误判。
- 分层重试（`recovery.ts`）：
  - `provider` 层：网络抖动/限流可重试，使用保守退避与上限预算。
  - `tool` 层：仅在“可幂等 + 可恢复错误”条件下允许重试。
  - 全局约束：任一 turn 的恢复总尝试次数有硬上限，防止异常循环。
- 幂等保护（`tool-orchestrator.ts`）：
  - 引入最小判定：`safe_to_retry=true` 才允许工具自动重试。
  - 对不可判定或明确高副作用工具，命中可恢复错误时直接 `stop/retry_exhausted`，不做自动重试。
  - 所有“被幂等保护拦截”的重试都写 trace 原因，避免静默失败。
- 可观测与断言（`observability/*`）：
  - 恢复链路标准事件：`recovery_started`、`retry_scheduled`、`retry_succeeded`、`retry_exhausted`、`recovery_stopped`。
  - 必含字段：`source/error_class/error_subclass/action/attempt/max_attempts/backoff_ms/blocked_by_idempotency`。

3. 执行策略（分批落地）
1. 批次 A：先落文档与类型兼容层（子类字段 + 不破坏既有测试）。
2. 批次 B：接入分层重试预算与全局上限（保持默认策略保守）。
3. 批次 C：接入工具幂等保护，并补恢复 trace 字段与断言。
4. 批次 D：故障注入回归门补齐，形成 Phase 2 前置门。

4. 与其它 WP 的耦合关系
- 依赖 `WP1-D` 的主类恢复语义，不重写主类，只做增强。
- 不改变 `WP1-E` transcript 事件模型，仅补 trace 侧恢复可观测字段。
- 复用 `WP1-F` 的“迁移即证据”框架，把恢复链路变为可断言序列。
- 与 `WP1-G` 联动，纳入统一门禁命令。

#### WP1-H 验证说明（具体 Case）

1. 建议测试文件
- `src/__tests__/phase1_recovery_hardening.test.ts`（WP1-H 新增）
- `src/__tests__/phase1_recovery_matrix.test.ts`（WP1-D 回归）
- `src/__tests__/phase1_trace_transition_assertions.test.ts`（恢复事件断言回归）

2. 必测用例清单（最小集合）

| Case ID | 场景 | Given | When | Then |
|---|---|---|---|---|
| `RHD-001` | 子类识别 | provider timeout 文案 | 分类错误 | `error_class=network_transient` 且 `error_subclass=timeout` |
| `RHD-002` | 子类降级兜底 | 未知错误文案 | 分类错误 | 不误判为可恢复，降级到保守路径 |
| `RHD-003` | provider 分层重试 | provider transient 错误 | 执行恢复 | 在预算内重试并写入 attempt/backoff |
| `RHD-004` | provider 重试耗尽 | 连续 transient 失败 | 超出预算 | 触发 `retry_exhausted` 并终止 |
| `RHD-005` | 工具可幂等重试 | `safe_to_retry=true` 且 transient | 工具失败 | 允许重试且成功后恢复到 `streaming` |
| `RHD-006` | 工具不可幂等拦截 | `safe_to_retry=false` 且 transient | 工具失败 | 禁止自动重试并记录 `blocked_by_idempotency=true` |
| `RHD-007` | 恢复总预算上限 | provider+tool 连续错误 | 多次恢复 | 达到总上限后强制终止，防止循环 |
| `RHD-008` | 恢复事件完整性 | 任一重试链路 | 回放 trace | 包含 started/scheduled/succeeded|exhausted 事件序列 |
| `RHD-009` | 与状态机一致性 | 恢复成功/失败两条链路 | 回放断言 | `recovering -> streaming|stopped` 与事件一致 |
| `RHD-010` | 不破坏既有矩阵 | 运行 WP1-D 用例 | 全量测试 | `DREC-001~008` 全部继续通过 |

3. 完成判定（Definition of Done for WP1-H）
1. `RHD-001 ~ RHD-010` 全部通过。
2. 新增恢复增强后，不引入 `phase1_*` 现有回归失败。
3. 对“不可幂等工具错误重试”具备默认保守保护，不出现重复副作用重试。
4. 形成 Phase 2 前置门结论：通过或带风险豁免（需文档化）。

4. 风险与回滚
- 风险：幂等判定过严导致恢复成功率下降。
- 风险：重试预算设置不当导致用户感知延迟增加。
- 回滚策略：
  - 保留 `WP1-D` 基础矩阵为 fallback（关闭子类增强与幂等门控）。
  - 通过配置或常量开关把 `WP1-H` 增强策略回退到保守 stop-only。

#### WP1-H 建议执行命令

1. `bun test src/__tests__/phase1_recovery_hardening.test.ts`
2. `bun test src/__tests__/phase1_recovery_matrix.test.ts`
3. `bun test src/__tests__/phase1_trace_transition_assertions.test.ts`
4. `bun test src/__tests__/phase1_query_engine.test.ts`

## 依赖与并行策略

1. 串行主链：`WP1-A -> WP1-B -> (WP1-C, WP1-D) -> WP1-E -> WP1-F -> WP1-G -> WP1-H`
2. 可并行项：`WP1-C` 与 `WP1-D` 可并行推进
3. 风险控制：`WP1-E` 依赖 `WP1-B` 事件抽象稳定后再接入，避免重复改写；`WP1-H` 采用分批增量，避免与主链交付耦合

## 里程碑

1. M1（状态机主线可运行）: 完成 `WP1-A + WP1-B`
2. M2（预算与恢复可控）: 完成 `WP1-C + WP1-D`
3. M3（可回放可核对）: 完成 `WP1-E + WP1-F`
4. M4（阶段收口）: 完成 `WP1-G` 并输出回对标报告
5. M4+（收尾硬化，不阻塞 M4）: 推进 `WP1-H`，作为 Phase 2 扩展前置门

## 风险与回滚策略

1. 风险：主循环重构引入行为回归
- 应对：保留 `legacyQueryEngine` 兼容路径直到 M2
2. 风险：budget 策略过早复杂化
- 应对：先实现单一保守策略，再迭代多策略
3. 风险：transcript 与 trace 重复建模
- 应对：先定义“最小差异原则”，transcript 仅记录用户可核对主链路

## 阶段收尾要求

1. 输出“与原版 Query/Tracing/Transcript 回对标”结论
2. 明确已对齐项、未对齐项、后续补齐计划
3. 同步更新：
  - [docs/roadmap/master-roadmap.md](../master-roadmap.md)（阶段状态）
  - [docs/architecture/system-design.md](../../architecture/system-design.md)（事实口径）

