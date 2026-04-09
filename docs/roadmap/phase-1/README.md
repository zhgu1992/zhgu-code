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

| WIP | 问题与边界 | 超越目标 | 核心设计 | 验证Case/DoD | 风险回滚 | 状态 |
|---|---|---|---|---|---|---|
| `wip1-a` | 已补充（见 WP1-A 设计核心） | 已补充（恢复性/可观测性） | 已补充（状态/迁移/不变式） | 已补充（TSM-001~016） | 待补充 | In Progress |

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

### WP1-C：Budget Guard（token/context）

- 目标：落地回合预算检查和最小降级策略
- 产出：
  - `src/application/query/budget.ts`
  - `QueryOptions.budget` 实际接线
  - 超预算处理策略（截断、提醒、停止其一或组合）
- 验收：
  - 预算边界可测试
  - 超预算行为可预测且可观测（有 trace/transcript 记录）

### WP1-D：错误分类与恢复矩阵

- 目标：统一错误语义并映射恢复动作
- 产出：
  - `src/application/query/errors.ts`
  - `src/application/query/recovery.ts`
  - 错误类型到恢复动作映射表
- 验收：
  - API/Tool/Permission/Network 至少四大类错误可区分
  - 中断/重试/终止路径有明确判定规则

### WP1-E：最小 Transcript 持久化与读取

- 目标：session 级 jsonl transcript，支持人工回放核对
- 产出：
  - `src/application/query/transcript/`（writer/reader/model）
  - `docs/transcript-model.md`（事件字段与约束）
- 验收：
  - 每轮记录 user/assistant 最终可见内容
  - 记录 `tool_use` 与 `tool_result` 关联
  - 可读取并复原主链路

### WP1-F：Trace 与状态机语义对齐

- 目标：把 trace 关键事件锚定到状态迁移点
- 产出：
  - `src/observability/*` 中新增或调整状态迁移事件
  - `src/observability/assertions.ts` 断言规则更新
- 验收：
  - turn 级回放可验证状态迁移完整性
  - 无 orphan 事件回归

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

## 依赖与并行策略

1. 串行主链：`WP1-A -> WP1-B -> (WP1-C, WP1-D) -> WP1-E -> WP1-F -> WP1-G`
2. 可并行项：`WP1-C` 与 `WP1-D` 可并行推进
3. 风险控制：`WP1-E` 依赖 `WP1-B` 事件抽象稳定后再接入，避免重复改写

## 里程碑

1. M1（状态机主线可运行）: 完成 `WP1-A + WP1-B`
2. M2（预算与恢复可控）: 完成 `WP1-C + WP1-D`
3. M3（可回放可核对）: 完成 `WP1-E + WP1-F`
4. M4（阶段收口）: 完成 `WP1-G` 并输出回对标报告

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
  - `docs/roadmap/master-roadmap.md`（阶段状态）
  - `docs/architecture/system-design.md`（事实口径）
