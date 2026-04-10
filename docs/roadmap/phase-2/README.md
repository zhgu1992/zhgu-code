# Phase 2 - Execution & Permission Plane

- Status: In Progress
- Updated: 2026-04-10

## 启动前对标结论（必填）

- 对标状态: Completed
- 对标日期: 2026-04-10
- 对标范围: Tool Runtime / Permission Rule Engine / Risk Grading / Audit Events
- 参考源码:
  - `claude-code-run/src/services/tools/StreamingToolExecutor.ts`
  - `claude-code-run/src/utils/permissions/permissions.ts`
  - `claude-code-run/src/utils/permissions/shellRuleMatching.ts`
  - `claude-code-run/src/tools/BashTool/bashPermissions.ts`
  - `claude-code-run/src/types/permissions.ts`
  - `rewrite/src/tools/executor.ts`
  - `rewrite/src/platform/permission/index.ts`
  - `rewrite/src/architecture/contracts/tool-runtime.ts`
  - `rewrite/src/ui/PermissionPrompt.tsx`
  - `rewrite/src/observability/trace-model.ts`

### 结论

1. 已对齐项:
- 契约层已冻结 `IToolRuntime.execute(name, input, store)` 与 `ToolExecutionAudit` 基础字段。
- 执行入口已统一在 `rewrite/src/tools/executor.ts`，具备基础 `ask/auto` 权限分支与错误回传。
- UI 已具备权限确认交互（`PermissionPrompt`），trace 已覆盖 `tool/permission/state` 基础事件。
- Phase 1 前置门（恢复与状态迁移断言）已具备可执行测试集，能作为 Phase 2 安全前提。
2. 差异项:
- 能力覆盖: 规则引擎仅有类型占位，无 `allow/deny/ask + source + scope` 的统一匹配实现。
- 稳定性: 执行器仍以 `permissionMode` 粗分支为主，缺少风险驱动决策与一致拒绝语义。
- 可观测性: 尚无完整 `ToolExecutionAudit` 持久化链路，难以回答“为何允许/拒绝”。
- 安全边界: `Write/Edit` 缺少统一边界策略；网络与 shell 高风险路径缺少统一分级门控。
- 复杂度: 多处治理逻辑尚未收敛到 `platform/permission`，后续扩展易产生分叉实现。
3. 本阶段范围:
- In Scope: 权限规则、风险分级、审计事件、边界硬化
- Out of Scope: 集成层和编排层能力

## 目标

把工具执行从“调用”升级为“治理”，并形成可验证、可追溯、可回滚的执行安全平面。

## 超越基线讨论（必填）

> 原则：对标源码只定义底线，不定义上限。

### 1) 超越方向

1. 决策一致性优先：规则与风险统一在平台层判定，避免工具层分叉实现。
2. 可解释性优先：每次允许/拒绝必须可追溯到规则命中与风险原因。
3. 默认保守优先：高风险路径先防误放行，再逐步放宽策略。

### 2) 超越指标

1. 100% 工具执行都生成 `audit` 记录（最小字段：`requestId/toolName/riskLevel/success/startedAt/endedAt`）。
2. 100% 被拒绝执行都包含结构化拒绝语义（`reasonCode + userMessage`）。
3. 高风险工具（shell/file-write/network-external）在 `auto` 模式误放行率目标 0。
4. Phase 2 新增测试覆盖至少 24 条 case，且不引入 `phase1_*` 回归失败。

### 3) 创新工作轨

1. SX2-1 决策双通道解释：内部稳定 `reasonCode`，外部可读 `message`。
2. SX2-2 策略开关治理：允许按 WIP 粒度灰度启停新决策链。

### 4) 风险与回滚策略

1. 新规则引擎与风险分级均提供开关，异常时回退到既有 `permissionMode` 粗分支。
2. 任一阶段若触发 Phase 1 前置门回归失败，立即停止扩展并回滚到上一稳定批次。

## WIP 执行门禁记录（必填）

执行规则：当进入“执行小步骤”或“讨论 wipxxx”时，若未完成门禁讨论，先补讨论再实现。
门禁新增要求：`为什么做 + 问题与边界` 为必填；未补齐不得从 `Pending` 进入 `In Progress`。

| WIP | 为什么做 + 问题与边界 | 超越目标 | 核心设计 | 验证Case/DoD | 风险回滚 | 状态 |
|---|---|---|---|---|---|---|
| `wip2-01` 对标与门禁基线 | Phase 2 模板态不可直接实施，先收敛决策口径与门禁流程 | 一次性固化对标结论与执行门禁，避免后续漂移 | 完整填写对标、超越目标、WIP 记录、里程碑与命令清单 | Phase 文档可直接排期，且无待补占位 | 不通过时仅回退文档 | Completed |
| `wip2-02` 权限规则引擎 | 仅有类型定义，无规则匹配执行逻辑 | 规则判定收敛到平台层，统一优先级语义 | 新增 `platform/permission/engine.ts`，支持 source/scope 与 `deny > ask > allow` | `PRE-001~004` 通过 | 开关回退到旧 `permissionMode` | Completed |
| `wip2-03` 风险分级模型 | 无统一 `ToolRiskLevel` 计算，风险无法动态升级 | 风险随输入动态升级，不只看工具名 | 新增 `platform/permission/risk.ts`，静态基线 + 输入特征升级 | `RSK-001~005` 通过 | 分级异常时回退静态基线 | Pending |
| `wip2-04` 执行入口治理接入 | `executeTool` 仍是简单审批流，拒绝语义不一致 | 不改调用方签名前提下接入完整治理流水线 | `tools/executor.ts` 接入 `risk -> permission -> execute/deny` | `EXE-001~006` 通过 | feature flag 退回旧执行路径 | Pending |
| `wip2-05` 审计事件链路 | 审计模型未持久化，无法追溯决策链路 | 构建“请求-决策-执行-结果”全链路可追溯 | 新增 audit emitter/writer，关联 trace span/requestId | `AUD-001~005` 通过 | 审计写入失败降级 trace-only | Pending |
| `wip2-06` Bash/文件边界硬化 | 文件写入/shell 高危路径缺统一边界 | 高风险默认可控，优先阻断不可逆副作用 | 文件路径边界检查 + shell 高危模式兜底 + 网络策略补强 | `HARD-001~008` 通过 | 可临时降级为 ask-only | Pending |
| `wip2-07` 收口验收与回滚预案 | 缺少 Phase 2 专项门禁套件 | 阶段交付具备可重复验收与豁免留痕 | 汇总测试与文档更新，形成验收报告模板 | `phase2_* + phase1_*` 前置门全绿 | 未达标不推进 Phase 3/4 | Pending |

## 阶段完成标准（DoD）

1. 权限决策统一走平台引擎，且规则/风险决策链可追溯。
2. 高风险工具默认保守，误放行率满足目标（测试集中为 0）。
3. 被拒绝链路具备稳定结构化语义（`reasonCode + userMessage`）。
4. `build/type/lint/test` 全绿，并通过 `phase1_*` 前置门回归。
5. 完成收口文档：已对齐项、未对齐项、风险豁免与回滚记录。

## 工作包（Work Packages）

### WP2-A：权限规则引擎（对应 `wip2-02`）

- 目标：实现统一规则匹配与决策输出。
- 产出：
  - `src/platform/permission/engine.ts`
  - `src/platform/permission/index.ts`（类型补齐）
  - `src/__tests__/phase2_permission_engine.test.ts`
- 验收：冲突/作用域/来源/默认策略均可稳定断言。

#### WP2-A 设计核心（必须先达成共识）

1. 为什么做（Why）
- 规则逻辑若继续散落在执行器与工具层，后续扩展会持续分叉。
- 先冻结决策语义，再接执行链路，可降低 `wip2-04` 接线回归风险。

2. 问题与边界
- In Scope：规则匹配、优先级、默认策略与决策解释。
- Out of Scope：执行器接线、风险分级算法、审计持久化。

3. 核心设计
- 动作优先级：`deny > ask > allow`。
- 作用域优先级：`tool` 级覆盖 `global` 级。
- 来源优先级：`session > user > default`（同等动作冲突时）。
- 默认策略：无命中规则时返回 `ask`。

4. 验证 Case（DoD）
- `PRE-001` 同时命中 `allow/deny` 时最终 `deny`。
- `PRE-002` `tool` 规则覆盖 `global` 规则。
- `PRE-003` `session` 规则覆盖 `user/default` 同类规则。
- `PRE-004` 空规则集或无命中时返回 `ask`。

5. 风险与回滚
- 引擎行为与预期不一致时，通过开关回退旧 `permissionMode`。

### WP2-B：风险分级模型（对应 `wip2-03`）

- 目标：形成统一 `ToolRiskLevel` 计算与输入升级规则。
- 产出：`risk.ts` + `phase2_risk_model.test.ts`。
- 验收：shell/file/network/external 升级路径可测试。

### WP2-C：执行入口治理接入（对应 `wip2-04`）

- 目标：在不改执行接口的前提下接入治理链路。
- 产出：`executor.ts` 治理接线 + 结构化拒绝语义。
- 验收：`auto/ask/plan` 行为一致，拒绝链路结构化。

### WP2-D：审计事件链路（对应 `wip2-05`）

- 目标：形成可追溯审计流水。
- 产出：audit writer/emitter + 查询恢复工具。
- 验收：单次 tool_call 可还原请求-决策-结果。

### WP2-E：边界硬化（对应 `wip2-06`）

- 目标：统一 Bash/文件/网络边界防护。
- 产出：路径边界检查、高危 shell 拦截、异常协议拒绝。
- 验收：越界写入/危险命令/异常协议测试全拒绝且含原因。

### WP2-F：阶段收口（对应 `wip2-07`）

- 目标：形成可重复验收与风险豁免记录。
- 产出：验收报告模板、豁免模板、阶段总结。
- 验收：`build/type/lint + phase2_* + phase1_*` 全绿。

## 依赖与并行策略

1. 串行主链：`wip2-02 -> wip2-03 -> wip2-04 -> wip2-05 -> wip2-06 -> wip2-07`
2. 并行项：
- `wip2-03` 风险分级与 `wip2-05` 审计字段可并行评审。
- `wip2-06` 测试可提前与 `wip2-04` 并行编写（先红后绿）。
3. 前置门：
- 进入 `wip2-04` 前，必须完成 `wip2-02/03` 接口冻结。
- 任意 WIP 开始前，必须通过 Phase 1 前置门测试集。

## 里程碑

1. M2-1（治理骨架可运行）：完成 `wip2-02 + wip2-03`
2. M2-2（执行链路可治理）：完成 `wip2-04 + wip2-05`
3. M2-3（安全边界可验证）：完成 `wip2-06`
4. M2-4（阶段收口）：完成 `wip2-07` 并更新 master roadmap

## 建议验收命令

1. `bun run build`
2. `bunx tsc --noEmit`
3. `bun run lint`
4. `bun test src/__tests__/phase1_recovery_hardening.test.ts src/__tests__/phase1_recovery_matrix.test.ts src/__tests__/phase1_trace_transition_assertions.test.ts src/__tests__/phase1_query_engine.test.ts`
5. `bun test src/__tests__/phase2*.test.ts`
