# zhgu-code rewrite 架构评估与行动蓝图

> 更新时间：2026-04-10  
> 评估方式：`codebase-onboarding + blueprint + verification-loop`  
> 目标：先完成“大架构与大能力”，再逐步补细节
> 核心架构设计和演进见 [docs/architecture/system-design.md](../architecture/system-design.md)

> 说明：本文件是全局路线图总览。  
> 分阶段执行细节见 [docs/roadmap/phase-*/README.md](./README.md)。

## 1) 架构基线对比（大模块）

当前 `rewrite` 已具备最小可运行闭环，但与参考实现相比，仍处于“核心骨架版”。

| 维度 | 参考实现（`/src`） | rewrite（`/rewrite/src`） | 结论 |
|---|---:|---:|---|
| 文件规模 | 2882 | 32 | rewrite 是精简骨架，方向正确，但能力面尚未铺开 |
| Tools 子系统文件 | 197 | 11 | 仅覆盖基础工具与最小执行器 |
| Commands 子系统文件 | 219 | 0（仅单入口参数） | 命令面基本未建设 |
| Services 子系统文件 | 151 | 1 | 平台能力（MCP/插件/远程/策略）未建立 |

## 2) 大能力完成度（架构视角）

### A. 已打通的核心能力（可演示）
- CLI + REPL 主闭环（可输入、可流式输出、可多轮工具调用）
- 基础工具平台（注册、执行、权限确认）
- 基础状态与 UI（消息、spinner、错误、token 展示）
- 基础上下文注入（cwd/git/CLAUDE.md/memory）

### B. 已做但深度不足（工程层）
- Query 引擎：缺少中断恢复、预算控制、上下文压缩、异常路径收敛
- Permission：仅 `ask/auto` 基础流，缺少规则系统与风险分级
- Tool 执行：缺少统一结果预算、审计与更严格的沙箱边界
- API 层：缺少重试/降级/故障分类与 provider 抽象层
- 测试层：用例有基础覆盖，但质量门不闭环（见第 4 节）

### C. 关键未建设能力（平台层）
- 多入口运行面：commands 体系、SDK/daemon/server 面
- Agent/Task 编排面：子任务、异步任务、计划执行状态机
- MCP/Plugin/Skill 集成面：外部能力接入主平面尚未落地
- 长会话治理：compact/context-collapse/token-budget
- 可观测性：成本、性能、事件与错误遥测链路

## 3) 你当前“已完成功能”的真实层级判断

| 功能域 | 当前层级 | 判断 |
|---|---|---|
| CLI + REPL | L2（可开发） | 主流程可用，但运行模式单一 |
| Query + Streaming | L2-（可用但脆弱） | 缺少复杂异常和长会话治理 |
| Tools 基础集 | L2（可开发） | 9 个工具可跑，但安全与治理能力不足 |
| 权限与交互 UI | L2（可开发） | 有确认流，但无策略体系与自动化风控 |
| Context 构建 | L1.5（基础） | 有输入，无“上下文预算与压缩策略” |
| 平台扩展能力 | L0-L1 | MCP/插件/Agent/Task 基本未建 |

> 结论：你不是“没做完”，而是**已完成核心骨架（约 35%-45% 的平台能力）**，下一步应从“功能堆叠”切换到“平台平面建设”。

## 4) 当前质量门基线（verification-loop）

在 `rewrite` 目录实测：

1. Build：`PASS`（`bun run build` 成功）
2. Type Check：`PASS`（`bunx tsc --noEmit` 成功）
3. Lint：`PASS`（`rewrite/biome.json` 局部配置已生效）
4. Test：`55 pass / 2 skip / 0 fail`
- skip：2 个联网测试（WebFetch/WebSearch）

> 结论：当前版本已具备“稳定迭代基线”，可作为 Phase 1 的门禁起点。

## 5) 后续行动蓝图（先大后小）

### Phase 0：架构冻结（先统一设计）
目标：把后续 4 个大平面先设计清楚，避免边做边改。

1. 输出 4 份 ADR（查询平面、执行权限平面、扩展集成平面、编排平面）
2. 定义核心边界接口（`IQueryEngine`、`IToolRuntime`、`IProvider`、`IOrchestrator`）
3. 固化目录重组方案（不要求一次迁移完）

完成标准：
- 目录与接口文档固定，后续 PR 只在该框架内演进

#### Phase 0 详细实施计划（可直接执行）

当前状态（2026-04-09）：
- `WP0-A` 完成（[docs/architecture/system-design.md](../architecture/system-design.md) 已校准为当前事实口径）
- `WP0-B` 完成（4 份 ADR 已落地）
- `WP0-C` 完成（4 个核心接口已在 `src/architecture/contracts/` 冻结）
- `WP0-D` 完成（`src/application/` 与 `src/platform/` 已建立过渡骨架）
- `WP0-E` 完成（type/lint/test 阻塞项已清除）

范围（In Scope）：
- 只做架构与边界收敛，不做大功能实现
- 产出可评审文档 + 可编译接口骨架 + 最小目录重组
- 建立 Phase 1/2 的开发入口与约束

非目标（Out of Scope）：
- 不实现 MCP/Agent/Task 业务能力
- 不重写现有 query 全逻辑
- 不引入新的工具能力面

执行工作包（Work Packages）：

1. `WP0-A` 架构现状快照
- 产出：[docs/architecture/system-design.md](../architecture/system-design.md) 校准为当前事实（模块边界、数据流、状态面）
- 验收：文档可映射到 `src` 的每个核心目录，不含“未来实现描述”

2. `WP0-B` 四个 ADR 落地
- 产出：[docs/adr/ADR-00{1..4}-*.md](../adr/)
- ADR 清单：
- [ADR-001-query-plane.md](../adr/ADR-001-query-plane.md)（回合状态机、错误恢复、预算入口）
- [ADR-002-execution-permission-plane.md](../adr/ADR-002-execution-permission-plane.md)（权限规则与风险分级）
- [ADR-003-integration-plane.md](../adr/ADR-003-integration-plane.md)（Provider/MCP/Plugin 接入边界）
- [ADR-004-orchestration-plane.md](../adr/ADR-004-orchestration-plane.md)（Plan/Task/Agent 生命周期）
- 验收：每个 ADR 必含 Context / Decision / Consequences / Rejected options

3. `WP0-C` 核心接口骨架
- 产出目录：`src/architecture/contracts/`
- 目标接口：
- `query-engine.ts`：`IQueryEngine`
- `tool-runtime.ts`：`IToolRuntime`
- `provider.ts`：`IProvider`
- `orchestrator.ts`：`IOrchestrator`
- 验收：接口可被当前代码引用且 `tsc --noEmit` 通过（不要求业务实现）

4. `WP0-D` 最小目录重组（非破坏）
- 产出目录：
- `src/architecture/`（架构层文档与契约）
- `src/platform/`（provider/permission/integration 占位）
- `src/application/`（query/orchestrator 过渡入口）
- 验收：现有入口 `entrypoint -> cli -> core/repl` 不受影响，运行路径不回归

5. `WP0-E` 质量门修复（为后续阶段清障）
- 必修项：
- 修复 2 个 type errors
- 处理 lint 配置不兼容（限定 rewrite 局部配置或脚本）
- 修复/隔离 Bash 测试环境依赖（`/bin/sh`）
- 验收：`build/type/test` 可作为后续阶段门禁

建议执行顺序（依赖图）：
- `WP0-A -> WP0-B -> WP0-C -> WP0-D`
- `WP0-E` 与 `WP0-B/WP0-C` 并行，但必须在 Phase 0 结束前完成

Phase 0 里程碑与 DoD：

1. M0（架构冻结）
- 4 个 ADR 评审通过
- [docs/architecture/system-design.md](../architecture/system-design.md) 与 [docs/roadmap/master-roadmap.md](./master-roadmap.md) 口径一致

2. M1（契约冻结）
- 4 个核心接口签名冻结
- 后续 PR 禁止绕过契约直接跨层耦合

3. M2（基线可迭代）
- `bun run build` 通过
- `bunx tsc --noEmit` 通过
- `bun test` 通过或有明确 skip 策略

Phase 0 建议交付物清单：
- [rewrite/docs/architecture/system-design.md](../architecture/system-design.md)（当前事实）
- [rewrite/docs/roadmap/master-roadmap.md](./master-roadmap.md)（路线与门禁）
- `rewrite/docs/adr/ADR-001..004`
- `rewrite/src/architecture/contracts/*.ts`
- `rewrite/tsconfig` 与 lint/test 脚本的最小修复

### Phase 0.1：链路追踪与可观测性基线（已完成，2026-04-09）
归档摘要：本阶段已完成最小观测链路建设，目标是“可追踪、可回放、可判定”且不改主业务路径。已落地统一 Trace 事件模型、进程内异步 Trace Bus、JSONL+Console 双 Sink、sidecar 观测窗口，以及 turn/tool/provider/orphan-span 四类链路断言规则。当前基线可在卡住/超时场景中快速定位具体阶段。

Phase 0.1 关键产物：
- [rewrite/docs/trace-model.md](../trace-model.md)
- `rewrite/src/observability/*`
- [rewrite/src/observability/README.md](../../src/observability/README.md)（模块速览与接入说明）
- `rewrite/scripts/trace-tail.sh`
- `rewrite/src/__tests__/phase0_1_observability.test.ts`

Phase 0.1 最小验收命令：
1. `bun run dev --prompt "hello"`（生成 `./.trace/trace.jsonl`）
2. `./scripts/trace-tail.sh`（sidecar 实时观测）
3. `bun test src/__tests__/phase0_1_observability.test.ts`（链路断言回放）
4. `bun run trace:pretty .trace/trace.jsonl`（人类可读时间线）

更多实现与对标细节：
- [rewrite/docs/architecture/system-design.md](../architecture/system-design.md) 第 13/14 节（原版模块对标机制与观测模块示例）
- [rewrite/docs/trace-model.md](../trace-model.md)（事件模型与断言规范）

### Phase 1：Query Engine v2（主脑平面）
目标：让核心对话引擎从“可跑”升级为“可持续”。

1. 引入 turn 状态机（idle/streaming/tool-running/recovering/stopped）
2. 引入 token/context budget 与自动续写策略
3. 引入 compact/collapse 插件点（先 stub，再实现）
4. 统一错误分类与恢复路径（API/Tool/Permission/Network）
5. 落地最小 transcript（session 级 jsonl 持久化）：
- 记录每个 turn 的 user/assistant 最终可见内容
- 记录 `tool_use` / `tool_result` 关联关系
- 提供最小读取与回放能力（用于人工验收与调试）

完成标准：
- 连续 20+ 轮对话不失稳
- 中断/恢复/重试路径可测试
- 每轮可在 transcript 中复原“输入 -> 工具 -> 输出”主链路

Phase 1 实施建议（新增）：
1. 先实现 turn 状态机主线（状态定义、迁移表、异常/中断路径），优先稳定控制面。
2. 在 Phase 1 内边实现边细化设计，把关键决策同步回 [docs/architecture/system-design.md](../architecture/system-design.md)/ADR，避免一次性过度设计。
3. 状态机主线稳定后，立即接入最小 transcript；先保证“可复原与可核对”，再迭代高级治理能力。
4. transcript 落地后，将 Phase 0.1 trace 事件语义对齐到状态迁移点（迁移即事件），再优化断言规则。
5. Phase 1 收尾时执行一次“与原版 Query/Tracing/Transcript 的回对标”，输出：已对齐项、缺口项、下一步补齐计划。

Phase 1 当前门禁命令（补充 / WP1-F）：
1. `bun test src/__tests__/phase1_trace_transition_assertions.test.ts`
2. `bun test src/__tests__/phase1_trace_transition_e2e.test.ts`
3. `bun run trace:assert .trace/trace.jsonl`

### Phase 2：Execution & Permission Plane（执行安全平面）
目标：把工具执行从“调用”升级到“治理”。

1. 权限规则模型（allow/deny/ask + 作用域 + 来源）
2. 工具风险分级（文件写入、shell、网络、外部系统）
3. 工具审计事件（谁、何时、执行了什么、结果）
4. Bash/文件工具增加更严格边界与错误语义

完成标准：
- 高风险工具默认可控
- 权限与审计可追踪

Phase 2 当前推进状态（2026-04-10）：
1. `wip2-01` 已完成：对标结论、超越目标、WIP 门禁、依赖与里程碑已在 [docs/roadmap/phase-2/README.md](./phase-2/README.md) 固化，可直接进入实现排期。
2. `wip2-02`（权限规则引擎）已完成：`platform/permission/engine.ts` 与 `phase2_permission_engine.test.ts` 已落地，且未提前改执行链路。
3. `wip2-03`（风险分级模型）已完成：`platform/permission/risk.ts` 与 `phase2_risk_model.test.ts` 已落地，覆盖 `RSK-001~005`。
4. `wip2-04`（执行入口治理接入）门禁讨论已完成：`WP2-C` 已补齐 Why/边界/决策矩阵/DoD/回滚，接口保持 `executeTool(name, input, store)` 不变。
5. `wip2-05`（审计事件链路）门禁讨论已启动：`WP2-D` 已补齐 Why/边界/事件序列/DoD/回滚，明确失败降级为 `trace-only`。
6. `wip2-06`（边界硬化）门禁讨论已完成：`WP2-E` 已补齐 Why/边界/边界门设计/DoD/回滚，明确在 `mode_gate` 后追加 `boundary_gate`。
7. `wip2-07`（阶段收口）已完成：新增 `src/application/phase2/closure.ts` 与 `phase2_closure.test.ts`，将放行决策矩阵、豁免校验、回滚基线与 DoD 阻塞规则落为可执行断言。
8. 进入 `wip2-04/05/06` 实现前置门保持不变：先冻结 `wip2-02/03` 接口，再按 `risk -> permission -> mode_gate -> boundary_gate -> execute/deny -> audit` 接线。
9. 当前串行主链保持：`wip2-02 -> wip2-03 -> wip2-04 -> wip2-05 -> wip2-06 -> wip2-07`。

### Phase 2.5：Context Monitoring Plane（监控先行）
目标：先完成 context 监控、告警、阻断信号统一，不在本阶段实现自动压缩策略。

1. 统一 context usage 与阈值状态口径（warning/error/blocking）
2. 补齐 context 事件（可追踪、可断言、可回放）
3. 对齐 `/context` 命令与 query 真实 API 视图
4. 形成压缩后置 TODO 交接包（移交 Phase Extra）

完成标准：
- Context 监控链路稳定可用，且不改变主链路行为
- 压缩策略未启用，但待办已结构化并可执行

### Phase 3：Integration Plane（MCP/Plugin/Skill）
目标：建立“最小可用能力接入层”，而非继续硬编码工具。

1. 最小 MCP 生命周期通路（可用性、降级、禁用）
2. 最小 Plugin/Skill 装载协议（元数据、禁用与回退）
3. 统一工具目录（内建工具 + 外接能力同一注册面）
4. 重型接入能力延期到 Phase Extra-B（Integration Advanced）

完成标准：
- 至少 1 条外部能力通路稳定可用
- 接入层不侵入 query 核心

### Phase 4：Orchestration Plane（Agent/Task/Plan）
目标：完成复杂任务所需编排能力。

1. Plan mode 从“标志位”升级为“状态机 + 审批流”
2. Task 模型（创建、状态、输出、取消）
3. Agent 子任务执行与结果汇聚协议

完成标准：
- 单任务可拆分执行并收敛
- 计划与执行链路可观测

### Phase 5：质量与发布平面（可迭代）
目标：把“开发可跑”升级为“持续可交付”。

1. 修复 typecheck 与 lint 链路
2. 测试分层：unit/integration/e2e + 网络测试隔离
3. 统一 PR 质量门（build、types、lint、tests、security）

完成标准：
- CI 绿灯可作为合并前置条件
- 回归成本可控

### Phase Extra：Advanced Modules（后置复杂模块池）
目标：在主架构稳定后承接高复杂度、可独立灰度和可独立回滚的模块化能力（A/B 双子轨）。

1. Extra-A（Context Advanced）：承接 Phase 2.5 的 context 压缩 TODO（策略编排、溢出恢复、质量评估）
2. Extra-B（Integration Advanced）：承接 Phase 3 延期的重型 MCP/Plugin/Skill 接入能力
3. 后续复杂模块统一纳入 Extra（遵循同一准入与回滚模板）
4. 默认要求：feature flag、独立验收、不破坏 Phase 1~5 前置门

完成标准：
- 复杂模块具备独立开关、独立门禁、独立回滚
- Extra-A 与 Extra-B 均可灰度上线，不影响主架构主链路稳定性

## 6) 建议的近期执行顺序（你下一步就做这个）

1. 先做 Phase 0（ADR + 目录/接口冻结），不要直接补零散功能。  
2. Phase 0.1 已完成（链路追踪基线），当前保持稳定并随 Phase 1 语义对齐。  
3. 进入 Phase 1（Query Engine v2），这是所有后续能力的“主依赖”。  
4. 再做 Phase 2（执行与权限平面），确保能力扩展前先守住风险。  
5. 插入 Phase 2.5（Context 监控先行），冻结监控口径并产出压缩 TODO 包。  
6. 再推进 Phase 3/4（集成面 + 编排面），形成平台能力闭环。  
7. 完成 Phase 5（质量与发布平面）并冻结主线质量门。  
8. 最后进入 Phase Extra（A/B 双子轨），承接 context advanced 与 integration advanced 高复杂度模块。  

## 7) 跨 Phase 粗步骤（含 WIP 门禁）

1. Phase 启动：
- 完成“源码对标结论”
- 完成“超越基线讨论（必填）”

2. WIP 拆分：
- 将当前 Phase 拆成可交付 WIP（如 `wip1a/wip1b/...`）
- 每个 WIP 都建立一条门禁记录（见 [docs/roadmap/README.md](./README.md)）

3. WIP 门禁讨论：
- 在进入实现前，逐条补齐：为什么做（Why）、问题边界、超越目标、核心设计、验证Case/DoD、风险回滚
- 任何未补齐项都不能进入实现态

4. WIP 实现与验证：
- 实现完成后按预先定义的 case/命令验证
- 验证通过再更新 WIP 状态为完成

5. Phase 收口：
- 汇总已完成 WIP 的验证证据
- 输出“对标 + 超越”阶段总结与下一阶段输入

执行纪律（会话级）：
- 当用户提出“执行小步骤”或“讨论 wipxxx”时，若门禁信息缺失，先提问补齐，再实施。

跨 Phase 一致性（更新 / 2026-04-10）：
- Phase 2/3/4/5 全部切换到与 Phase 1 一致的实施骨架：`WIP门禁表(Why必填) -> 阶段DoD -> Work Packages -> WIP级设计核心/Case/回滚`。
- 状态流转统一为：门禁补齐后方可 `Pending -> In Progress`，Case 与前置门通过后方可 `In Progress -> Done`。

---

如果后续你愿意，我可以直接在本仓库按这个蓝图落第一个交付：  
`Phase 0 ADR + 目录重构草案 + Query/Tool/Provider/Orchestrator 四个接口骨架`。  
