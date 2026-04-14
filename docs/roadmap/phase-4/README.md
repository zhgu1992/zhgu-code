# Phase 4 - Orchestration Plane

- Status: In Progress
- Updated: 2026-04-14

## 启动前对标结论（必填）

- 对标状态: In Progress（首轮对标已完成，待补充源仓边界 case 证据后冻结）
- 对标日期: 2026-04-13
- 对标范围: Plan Mode / Task Model / Agent Orchestration
- 参考源码（启动时逐项核对）:
  - `claude-code-run/src/commands/plan/*`
  - `claude-code-run/src/tools/EnterPlanModeTool/*`
  - `claude-code-run/src/tools/AgentTool/*`
  - `claude-code-run/src/tasks/*`
  - `claude-code-run/src/coordinator/*`
  - `claude-code-run/src/state/*`
  - `rewrite/src/application/orchestrator/*`
  - `rewrite/src/architecture/contracts/orchestrator.ts`
  - `rewrite/src/application/query/query-runner.ts`
  - `rewrite/src/state/store.ts`

### 基线结论（待对标完成后冻结）

1. 已对齐项:
- 编排契约 `IOrchestrator` 已冻结最小接口（`startSession/submitTask/updateTaskStatus/cancelTask/listTasks`）。
- `NoopOrchestrator` 已提供过渡实现，不影响现有 Query 主链路。
- `permissionMode=plan` 已存在，且执行层具备 plan 模式阻断（Phase 2 治理基线可复用）。
- Trace 基建已可承载 Phase 4 事件（`traceBus` + query turn transition）。
2. 差异项:
- 能力覆盖: Plan 仍是模式开关，尚未成为显式状态机；Task 无暂停/阻塞/终态原因；无 Agent 汇聚协议。
- 稳定性: 长任务取消、恢复、重放策略未定义，`NoopOrchestrator` 无并发约束。
- 可观测性: 缺少 Phase 4 级事件链（plan/task/aggregation/approval）与收口门禁模板。
- 安全边界: 缺少“计划审批 -> 任务执行 -> 子任务工具调用”的继承矩阵。
- 复杂度: 编排面尚未与 query/runtime 完全脱耦，跨层状态同步策略未冻结。
3. 本阶段范围:
- In Scope: Plan 状态机、Task 生命周期、Agent 结果汇聚、审批与权限继承、阶段收口模板。
- Out of Scope: 外部生态接入扩展、跨节点分布式编排、复杂持久化后端（仅保留可替换接口）。

## 目标

提供复杂任务所需的计划、任务与代理编排能力，并保证执行链路可治理、可观测、可回退。

## 超越基线讨论（必填）

> 原则：对标源码只定义底线，不定义上限。

### 1) 超越方向

1. 状态机优先：Plan/Task 生命周期必须显式化并可断言。
2. 可取消与可恢复优先：长任务不依赖“重启会话”恢复。
3. 汇聚可解释优先：子任务结果合并规则稳定且可回放。

### 2) 超越指标

1. 任务生命周期事件完整率 100%（创建/运行/暂停/取消/完成）。
2. 取消命令生效延迟 < 2s（测试环境基准）。
3. 子任务汇聚一致性 100%（同输入同策略输出一致）。
4. Phase 4 新增测试至少 24 条 case，且不引入前置阶段回归失败。

### 3) 创新工作轨

1. SX4-1 汇聚策略插件化：支持最小策略集合（first-success/all-required）。
2. SX4-2 编排诊断视图：任务状态迁移与失败点可一键回放。

### 4) 风险与回滚策略

1. 编排链路异常时，允许降级为单任务直跑模式。
2. 任一关键状态机断言失败时，阻断后续能力扩展并回滚到稳定版本。

## WIP 执行门禁记录（必填）

执行规则：当进入“执行小步骤”或“讨论 wipxxx”时，若未完成门禁讨论，先补讨论再实现。
门禁新增要求：`为什么做 + 问题与边界` 为必填；未补齐不得从 `Pending` 进入 `In Progress`。

| WIP | 为什么做 + 问题与边界 | 超越目标 | 核心设计 | 验证Case/DoD | 风险回滚 | 状态 |
|---|---|---|---|---|---|---|
| `wip4-01` 对标与门禁基线 | Phase 4 尚未冻结边界，直接实现风险高 | 固化编排面边界与门禁，防止状态语义漂移 | 完成对标证据、WIP 门禁、里程碑、命令清单 | 文档可直接排期且门禁字段完整 | 不通过仅回退文档 | In Progress |
| `wip4-01a` 最小模式切换与实现命令（A0） | 当前仅支持启动参数切换模式，运行中 plan/implement 切换摩擦高 | 在不引入完整审批流前先打通最小切换闭环，降低 Phase 4 实施阻力 | 新增本地命令解析（`/mode`、`/plan`、`/implement`）+ 运行时 mode 切换 action | `A0-001~006` 通过 | 回退到启动参数模式切换（`--plan/--ask/--auto`） | In Progress |
| `wip4-02` Plan 状态机 | 计划流仍偏标志位，缺少迁移约束 | 计划流从标志位升级为可断言状态机 | 新增 plan-state 迁移表与守卫 | `PLN-001~006` 通过 | 回退到旧 plan 标志位模式 | Pending |
| `wip4-03` Task 生命周期模型 | 任务状态定义不完整，取消/失败语义弱 | 统一任务生命周期与终态原因 | 新增 task model + transition guards | `TSK-001~007` 通过 | 回退到最小任务模型 | Pending |
| `wip4-04` Agent 子任务汇聚协议 | 子任务结果合并规则未收敛 | 统一汇聚策略并保证结果一致性 | 汇聚策略层 + 冲突解决规则 | `AGG-001~006` 通过 | 降级为单子任务串行 | Pending |
| `wip4-05` 审批与权限继承治理 | 计划与任务权限边界易漂移 | 明确审批流与权限继承策略 | 审批事件链 + 权限继承矩阵 | `APR-001~005` 通过 | 权限异常时强制 ask 模式 | Pending |
| `wip4-06` 收口验收与文档回写 | 缺少阶段验收与回滚记录 | 形成可重复验收和豁免模板 | 汇总测试、对标结论、回滚预案 | `phase4_* + 前置门` 全绿 | 未达标不推进 Phase 5 | Pending |

## 阶段完成标准（DoD）

1. Plan 与 Task 生命周期由显式状态机驱动，非法迁移可检测。
2. 子任务汇聚策略可测试且结果一致。
3. 运行期模式切换命令可用（`/mode`、`/plan`、`/implement`），且不绕过 plan 模式阻断。
4. `build/type/lint/test` 全绿，且不引入前置阶段回归。
5. 输出阶段回对标结论、风险豁免与回滚记录。

## 工作包（Work Packages）

### WP4-A0：最小模式切换与实现命令（对应 `wip4-01a`）

- 目标：提供会话内最小可用的 plan/implement 切换命令，降低编排面实施摩擦。
- 产出：
  - `src/state/store.ts`（新增 permission mode 切换 action）
  - `src/ui/App.tsx`（新增本地命令解析）
  - `src/core/commands/mode-command.ts`（最小命令路由，可与 UI 解耦）
  - `src/__tests__/phase4_mode_switch.test.ts`
- 验收：运行期可切换模式，且 plan 模式工具阻断语义不变。

#### WP4-A0 设计核心（必须先达成共识）

1. 为什么做（Why）
- 当前 `rewrite` 只支持启动参数（`--plan/--ask/--auto`）切换，运行期无法便捷切换，导致“先规划再实现”链路成本高。

2. 问题与边界
- In Scope：本地命令解析、mode 切换 action、错误提示、trace 记录。
- Out of Scope：完整 Plan 文件审批流与复杂命令系统。

3. 核心设计
- 支持命令：
  - `/mode <plan|ask|auto>`
  - `/plan`（等价 `/mode plan`）
  - `/implement [ask|auto]`（默认 `ask`）
- 命令在本地处理，不进入模型对话，不写入普通 user 消息队列。
- 切换后写入 `permission_mode_switched` 事件，便于审计与回放。
- 继续复用现有执行器守卫：`mode=plan` 时工具调用仍返回 `plan_mode_blocked`。

4. 验证 Case（DoD）
- `A0-001` 输入 `/plan` 后 permission mode 切到 `plan`。
- `A0-002` 在 `plan` 下输入 `/implement` 后默认切到 `ask`。
- `A0-003` 输入 `/mode auto` 后切到 `auto`。
- `A0-004` 无效模式（如 `/mode foo`）返回友好错误且不改状态。
- `A0-005` 切到 `plan` 后工具调用仍被 `plan_mode_blocked` 拦截。
- `A0-006` 本地命令不会触发 query 轮次（不走模型调用）。

5. 风险与回滚
- 若本地命令解析引入回归，关闭命令入口并回退到启动参数切换模式。

### WP4-A：Plan 状态机（对应 `wip4-02`）

- 目标：定义并落地 Plan 生命周期状态机。
- 产出：
  - `src/application/orchestrator/plan-state.ts`
  - `src/__tests__/phase4_plan_state_machine.test.ts`
- 验收：启动、审批、执行、终止、取消路径均可断言。

#### WP4-A 设计核心（必须先达成共识）

1. 为什么做（Why）
- 标志位流无法稳定表达审批与执行的复杂分支，回归风险高。

2. 问题与边界
- In Scope：状态定义、迁移守卫、终态原因。
- Out of Scope：业务任务细节与外部能力接入。

3. 核心设计
- 状态建议：`draft -> awaiting-approval -> running -> blocked -> completed|cancelled|failed`。
- 守卫规则：拒绝非法迁移，终态不可迁移。
- 事件锚点：每次迁移都需写 trace 证据。

4. 验证 Case（DoD）
- `PLN-001` 创建计划进入 `draft`。
- `PLN-002` 提交审批进入 `awaiting-approval`。
- `PLN-003` 审批通过进入 `running`。
- `PLN-004` 审批拒绝进入 `failed(permission_denied)`。
- `PLN-005` 运行中取消进入 `cancelled`。
- `PLN-006` 终态后迁移被阻断。

5. 风险与回滚
- 状态机接线异常时，回退到旧 plan 标志位流程。

### WP4-B：Task 生命周期模型（对应 `wip4-03`）

- 目标：统一任务生命周期与终态语义。
- 产出：
  - `src/application/orchestrator/task-state.ts`
  - `src/application/orchestrator/task-model.ts`
  - `src/architecture/contracts/orchestrator.ts`（最小兼容扩展）
  - `src/__tests__/phase4_task_lifecycle.test.ts`
- 验收：创建/运行/暂停/取消/完成/失败路径可测。

#### WP4-B 设计核心（必须先达成共识）

1. 为什么做（Why）
- 当前任务仅 `pending/running/completed/failed/canceled`，缺少暂停与终态原因，无法稳定支撑“取消/恢复/审批拒绝”的治理场景。

2. 问题与边界
- In Scope：任务状态机、终态原因字典、迁移守卫、事件序列。
- Out of Scope：外部存储引擎与分布式调度。

3. 核心设计
- 状态建议：`pending -> running -> paused -> running -> completed|failed|canceled`，并允许 `pending -> canceled`。
- 终态原因建议：`user_canceled | permission_denied | dependency_failed | timeout | runtime_error`。
- 兼容策略：对外仍兼容 `TaskStatus` 既有字段，新增字段走可选扩展并保留映射层。
- 每次迁移写入 `task_event_seq`，用于重放与一致性校验。

4. 验证 Case（DoD）
- `TSK-001` 新建任务默认 `pending`。
- `TSK-002` 合法迁移 `pending -> running` 通过。
- `TSK-003` `running -> paused -> running` 可恢复。
- `TSK-004` `running -> canceled(user_canceled)` 终态写入原因。
- `TSK-005` `running -> failed(runtime_error)` 终态写入原因。
- `TSK-006` 非法迁移（如 `completed -> running`）被阻断。
- `TSK-007` 相同迁移重复提交保持幂等，不重复写终态事件。

5. 风险与回滚
- 若状态扩展造成兼容问题，回退为旧 `TaskStatus` 并仅保留 `reason` 字段日志化。

### WP4-C：Agent 汇聚协议（对应 `wip4-04`）

- 目标：定义子任务结果汇聚协议。
- 产出：
  - `src/application/orchestrator/aggregation.ts`
  - `src/application/orchestrator/aggregation-strategies.ts`
  - `src/__tests__/phase4_agent_aggregation.test.ts`
- 验收：汇聚一致性与失败策略可断言。

#### WP4-C 设计核心（必须先达成共识）

1. 为什么做（Why）
- 子任务执行结果目前没有稳定收敛规则，容易出现“同输入、不同批次输出不一致”。

2. 问题与边界
- In Scope：最小策略集合、冲突决议、确定性输出。
- Out of Scope：复杂评分模型与跨会话学习。

3. 核心设计
- 首批策略：`first_success`、`all_required`。
- 统一输出：`status/result/failedTaskIds/conflicts/resolution`。
- 冲突处理：固定排序（`taskId` + 提交序），禁止依赖并发完成时序。
- 失败策略：`all_required` 任一失败即整体失败并保留部分结果快照。

4. 验证 Case（DoD）
- `AGG-001` `first_success` 在多成功场景下输出稳定 winner。
- `AGG-002` `first_success` 在全失败场景下返回结构化失败原因。
- `AGG-003` `all_required` 在全部成功时输出聚合成功。
- `AGG-004` `all_required` 任一失败时整体失败并返回失败集合。
- `AGG-005` 同输入重复运行输出完全一致。
- `AGG-006` 汇聚冲突时输出冲突组与决议策略字段。

5. 风险与回滚
- 汇聚策略异常时降级到单子任务串行执行并保留聚合诊断日志。

### WP4-D：审批与权限继承（对应 `wip4-05`）

- 目标：收敛计划-任务-子任务权限边界。
- 产出：
  - `src/application/orchestrator/approval.ts`
  - `src/application/orchestrator/permission-inheritance.ts`
  - `src/__tests__/phase4_approval_inheritance.test.ts`
- 验收：权限漂移场景可测试。

#### WP4-D 设计核心（必须先达成共识）

1. 为什么做（Why）
- 当前 plan 模式与任务执行权限缺少统一继承定义，容易出现“计划可过、任务侧越权”。

2. 问题与边界
- In Scope：审批事件链、继承矩阵、拒绝语义、与 Phase 2 权限门的最小接线。
- Out of Scope：组织级 RBAC、多租户策略中心。

3. 核心设计
- 审批链建议：`plan_approved -> task_admitted -> tool_call_allowed`。
- 继承矩阵建议：`plan(ask|auto|plan)` 映射到 task 默认权限，并允许更严格不允许更宽松。
- 拒绝语义统一：`reasonCode` 对齐 Phase 2（如 `plan_mode_blocked`、`permission_denied`）。
- 漂移保护：检测到越权时强制回退 `ask` 并打审计事件。

4. 验证 Case（DoD）
- `APR-001` 未审批计划不可提交任务。
- `APR-002` `plan=ask` 下 task 默认 ask，不可自动升级为 auto。
- `APR-003` 审批拒绝后任务进入 `failed(permission_denied)`。
- `APR-004` 子任务调用工具时继承上游权限，不允许绕过。
- `APR-005` 检测到权限漂移时自动降级 ask 并记录审计事件。

5. 风险与回滚
- 审批链接线异常时统一回退到“全部 ask”安全模式。

### WP4-E：阶段收口（对应 `wip4-06`）

- 目标：形成可重复验收与文档回写。
- 产出：
  - `src/application/phase4/closure.ts`
  - `src/__tests__/phase4_closure.test.ts`
  - `docs/roadmap/phase-4/phase4-acceptance.md`
  - `docs/roadmap/phase-4/phase4-rollback.md`
- 验收：Phase 4 专项门禁全绿。

#### WP4-E 设计核心（必须先达成共识）

1. 为什么做（Why）
- 没有阶段收口模板会导致 Phase 4 “有实现、无门禁闭环”，无法稳定推进 Phase 5。

2. 问题与边界
- In Scope：hard gate 模板、DoD 断言、豁免记录、回滚演练、路线图回写阻塞条件。
- Out of Scope：Phase 5 质量门实现。

3. 核心设计
- 参考 Phase 3 `closure.ts` 模式，新增 Phase 4 对应 gate 与 DoD 校验器。
- 固化 hard gate：`build/typecheck/lint/phase1/phase2/phase3/phase4`。
- 任一 gate 失败或 DoD 未满足，`phase5Blocked=true`。

4. 验证 Case（DoD）
- `CLS4-001` hard gate 缺失或失败时收口决策为 `FAIL`。
- `CLS4-002` DoD case 未满足时不得推进 Phase 5。
- `CLS4-003` 豁免项过期或未审批时阻断收口。
- `CLS4-004` 全门禁通过时决策为 `PASS` 且生成验收模板。

5. 风险与回滚
- 收口逻辑异常时保留手工验收通路，但不得标记阶段 Done。

## Phase 4 执行切片（架构师建议）

1. `PR4-0`（`wip4-01a`）：最小模式切换命令与 `A0-001~006`。
2. `PR4-1`（`wip4-02`）：Plan 状态机与 `PLN-001~006`。
3. `PR4-2`（`wip4-03`）：Task 生命周期与 `TSK-001~007`。
4. `PR4-3`（`wip4-04`）：汇聚策略与 `AGG-001~006`。
5. `PR4-4`（`wip4-05`）：审批继承与 `APR-001~005`。
6. `PR4-5`（`wip4-06`）：收口模板与 `CLS4-001~004`。

## 关键文件（首批）

1. `rewrite/src/architecture/contracts/orchestrator.ts`
2. `rewrite/src/application/orchestrator/index.ts`
3. `rewrite/src/application/query/query-runner.ts`
4. `rewrite/src/state/store.ts`
5. `rewrite/src/__tests__/phase4*.test.ts`

## 依赖与并行策略

1. 串行主链：`wip4-01 -> wip4-01a -> wip4-02 -> wip4-03 -> wip4-04 -> wip4-05 -> wip4-06`
2. 并行项：`wip4-03` 与 `wip4-04` 可并行做“接口评审”，代码实现建议 `wip4-03` 先落地再接 `wip4-04`。
3. 前置门：进入实现前必须完成 `wip4-01` 对标结论冻结。

## 里程碑

1. M4-0（模式切换最小闭环）：完成 `wip4-01a`
2. M4-1（Plan 状态机可运行）：完成 `wip4-02`
3. M4-2（Task/汇聚可治理）：完成 `wip4-03 + wip4-04`
4. M4-3（审批与权限可验证）：完成 `wip4-05`
5. M4-4（阶段收口）：完成 `wip4-06`

## 建议验收命令（草案）

1. `bun run build`
2. `bunx tsc --noEmit`
3. `bun run lint`
4. `bun test src/__tests__/phase4*.test.ts`
5. `bun test src/__tests__/phase1*.test.ts src/__tests__/phase2*.test.ts src/__tests__/phase3*.test.ts`
