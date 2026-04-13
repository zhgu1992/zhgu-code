# Phase 3 - Integration Plane

- Status: In Progress
- Updated: 2026-04-13

## 启动前对标结论（必填）

- 对标状态: Pending（未完成对标，禁止进入实现）
- 对标日期: 待执行（启动当日填写）
- 对标范围: MCP / Plugin / Skill Integration
- 参考源码（启动时逐项核对）:
  - `claude-code-run/src/services/mcp/*`
  - `claude-code-run/src/services/plugins/*`
  - `claude-code-run/src/services/skills/*`
  - `claude-code-run/src/tools/*`
  - `rewrite/src/platform/integration/*`

### 基线结论（待对标完成后冻结）

1. 已对齐项:
- 暂无（待对标完成后补齐）。
2. 差异项:
- 能力覆盖: 待对标确认（最小 MCP 通路、最小装载协议、统一注册面）。
- 稳定性: 待对标确认（连接降级、故障隔离、禁用回退）。
- 可观测性: 待对标确认（接入失败原因与事件链路）。
- 安全边界: 待对标确认（来源可信度、版本校验、权限约束）。
- 复杂度: 待对标确认（接入层与 Query 核心耦合度）。
3. 本阶段范围:
- In Scope: 最小可用接入平面（统一注册面、最小装载协议、最小 MCP 通路、最小安全隔离）。
- Out of Scope: 重型接入能力（复杂鉴权矩阵、多 transport 扩展、企业策略包、连接规模化治理）。

## 目标

建立 MCP/Plugin/Skill 最小可用接入层，让“能力扩展”从硬编码升级为可治理、可回退、可观测。

## 与 Phase Extra 的关系（新增）

1. Phase 3 必须完成“最小接入闭环”，不把接入平面整体后移。
2. Phase 3 中未纳入的重型接入能力统一延期到 Phase Extra-B（Integration Advanced）实现。
3. Phase 4/5 依赖的是“接入平面存在且稳定”，不依赖重型 MCP 能力全集。

## 超越基线讨论（必填）

> 原则：对标源码只定义底线，不定义上限。

### 1) 超越方向

1. 接入解耦优先：接入层不侵入 Query 主链路。
2. 生命周期治理优先：发现、启停、故障恢复统一流程化。
3. 失败可解释优先：接入失败必须可定位到模块与原因。

### 2) 超越指标

1. 至少 1 条外部能力通路稳定可用（连续 20 次调用成功率 >= 99%）。
2. 接入失败 100% 返回结构化错误（`source/module/reasonCode/userMessage`）。
3. Plugin/Skill 禁用与回退路径覆盖率 100%（以测试 case 为准）。
4. 接入层新增测试至少 16 条 case，且不引入 `phase1_*` 与 `phase2_*` 回归失败。

### 3) 创新工作轨

1. SX3-1 能力健康探针：接入层对 MCP/Plugin 维护最小健康状态与最近失败原因。
2. SX3-2 统一能力目录：内建与外接能力在同一目录输出可查询元数据。
3. SX3-3 接线可视化：输出最小能力接线视图，支持“来源/状态/可调度性/冲突”快速定位。

### 4) 风险与回滚策略

1. 任一接入点异常时，可按 provider/plugin 粒度禁用，不阻断核心对话能力。
2. 若引入回归，允许回退到“仅内建工具”运行模式。

## WIP 执行门禁记录（必填）

执行规则：当进入“执行小步骤”或“讨论 wipxxx”时，若未完成门禁讨论，先补讨论再实现。
门禁新增要求：`为什么做 + 问题与边界` 为必填；未补齐不得从 `Pending` 进入 `In Progress`。

| WIP | 为什么做 + 问题与边界 | 超越目标 | 核心设计 | 验证Case/DoD | 风险回滚 | 状态 |
|---|---|---|---|---|---|---|
| `wip3-01` 对标与门禁基线 | Phase 3 仍为模板态，缺少可执行门禁 | 固化接入层对标范围与实施顺序，避免边做边改 | 完成对标证据、WIP 门禁、里程碑、命令清单 | 文档可直接排期且门禁字段完整 | 不通过仅回退文档 | Pending |
| `wip3-02` 最小 MCP 生命周期通路 | 缺少连接发现/可用性统一流程，导致外部能力不可控 | 用最小状态机跑通 1 条外部通路 | 新增 lifecycle manager（最小状态 + 重试 + 禁用） | `MCP-001~004` 通过 | 保留静态配置直连兜底 | Pending |
| `wip3-03` 最小 Plugin/Skill 装载协议 | 装载元数据与禁用策略未统一 | 统一最小 manifest 校验与禁用回退 | 新增 loader/validator 与错误语义 | `PLG-001~006` 通过 | 装载失败降级为禁用该项 | Done |
| `wip3-04` 统一注册面接线 | 内建与外接能力注册口径分离 | 内建/外接统一目录输出，主链路单入口消费 | 新增 registry adapter 并接线 query/tool runtime | `REG-001~005` 通过 | 回退到内建 registry | Pending |
| `wip3-05` 最小安全隔离与熔断 | 外接能力边界缺少统一约束 | 提供最小来源校验和按 provider/plugin 熔断能力 | 来源校验、协议校验、开关禁用 | `SEC-001~004` 通过 | 开关禁用外接能力 | Pending |
| `wip3-06` 收口验收与延期交接 | 缺少阶段级验收与“延期到 Extra-B”清单 | 形成可重复验收 + 延期项交接包 | 汇总测试、对标结论、回滚脚本、deferred list | `phase3_* + 前置门` 全绿 | 未达标不推进 Phase 4/5 | Pending |
| `wip3-07` 最小可视化接线 | 接入问题排查依赖读日志，定位慢 | 让“能力来源/状态/冲突/可调用性”可视化可核对 | 新增 registry graph snapshot 与 query 命令入口 | `VIS-001~004` 通过 | 回退到文本摘要输出 | Pending |

## 阶段完成标准（DoD）

1. 至少一条 MCP/Plugin/Skill 外部能力通路稳定可用。
2. 接入失败具备结构化错误和可追溯事件。
3. 统一注册面可同时查询内建与外接能力元数据。
4. `build/type/lint/test` 全绿，且不引入前置 Phase 回归。
5. 输出阶段回对标结论、风险豁免记录与“Deferred to Extra-B”清单。
6. 提供最小接线可视化输出（可用于联调与验收截图）。

## 工作包（Work Packages）

### WP3-A：最小 MCP 生命周期通路（对应 `wip3-02`）

- 目标：建立最小 MCP 连接生命周期状态机并跑通 1 条外部通路。
- 产出：
  - `src/platform/integration/mcp/lifecycle.ts`
  - `src/platform/integration/mcp/types.ts`
  - `src/__tests__/phase3_mcp_lifecycle.test.ts`
- 验收：连接可用性检测、故障降级、禁用回退路径可测试。

#### WP3-A 设计核心（必须先达成共识）

1. 为什么做（Why）
- 没有统一生命周期，连接失败会散落在调用点，难以定位与恢复。

2. 问题与边界
- In Scope：连接状态、重试策略、健康状态输出。
- Out of Scope：上层业务编排与复杂调度。

3. 核心设计
- 状态建议：`disconnected -> connecting -> ready -> degraded -> disabled`。
- 故障策略：可恢复错误限次重试，不可恢复错误直接 `disabled`。
- 可观测性：状态迁移与错误分类统一写 trace/audit。

4. 验证 Case（DoD）
- `MCP-001` 首次连接成功进入 `ready`。
- `MCP-002` 连接不可用时进入 `degraded` 并输出结构化原因。
- `MCP-003` 重试耗尽后进入 `disabled`。
- `MCP-004` 禁用后不会再被调度。

5. 风险与回滚
- 生命周期接线回归时，可回退到静态单连接模式。

### WP3-B：最小 Plugin/Skill 装载协议（对应 `wip3-03`）

- 目标：定义并实现最小统一装载协议。
- 产出：
  - `src/platform/integration/plugin/types.ts`
  - `src/platform/integration/plugin/loader.ts`
  - `src/__tests__/phase3_plugin_skill_loader.test.ts`
- 验收：装载成功与失败路径均可断言。

#### WP3-B 设计核心（必须先达成共识）

1. 为什么做（Why）
- 当前 Plugin/Skill 装载缺少统一入口，失败策略不一致，导致“能否加载、为何失败、是否可回退”不可治理。

2. 问题与边界
- In Scope：最小 manifest 校验、最小版本策略、禁用与回退、结构化失败原因、可追溯事件、兼容 claude-code-run 内置 skill 读取语义（bundled/skills/plugin 三来源最小并集）。
- Out of Scope：复杂依赖解析、签名校验、供应链策略包、远端拉取与多源同步（延期到 Extra-B）。

3. 核心设计
- 统一装载状态：`discovered -> loaded | disabled`。
- 统一错误语义：失败必须输出 `source/module/reasonCode/userMessage/retryable/detail?`。
- 最小 manifest 约束：
  - Plugin：优先读取 `.claude-plugin/plugin.json`；缺失时允许 fallback（`name=目录名`，`version=0.0.0-implicit`）。
  - Skill：要求存在 `SKILL.md`；可选 `skill.json` 扩展元数据。
- 最小版本策略：
  - 缺失 `version` 允许装载并打隐式版本标记。
  - 非法版本或不兼容 `apiVersion` 进入 `disabled`。
- 内置 skill 兼容读取（新增）：
  - 对标 `claude-code-run/src/skills/bundledSkills.ts` 与 `src/skills/loadSkillsDir.ts` 的核心能力，至少支持 `SKILL.md` 目录格式与程序注册型 bundled skills。
  - 对标 `claude-code-run/src/commands.ts` 的聚合语义，统一输出 `loadedFrom` 来源标记（`bundled/skills/plugin`）供后续 registry 使用。
  - 简化原则：仅保留最小读取与元数据解析链路，不复制主仓的远端技能检索、复杂特性开关和大规模缓存策略。
- 回退策略：单项装载失败只禁用该项，不阻断其余装载链路；可回退到“仅内建能力”模式。

4. 验证 Case（DoD）
- `PLG-001` 有效 Plugin manifest 装载成功并进入 `loaded`。
- `PLG-002` manifest 缺失时按 fallback 策略装载成功并可查询隐式版本。
- `PLG-003` manifest 非法时进入 `disabled` 且输出结构化失败原因。
- `PLG-004` 版本不兼容时进入 `disabled` 且 `reasonCode=version_incompatible`。
- `PLG-005` 被禁用项不会再次被调度，且不影响其他项装载。
- `PLG-006` 能读取并装载内置 bundled skill（含 `loadedFrom=bundled` 元数据），用于回归验证既有技能。

5. 对标参考（Skill 读取）
- 聚合与筛选：`claude-code-run/src/commands.ts`（`getSkills/getSkillToolCommands`）。
- 本地技能目录读取：`claude-code-run/src/skills/loadSkillsDir.ts`（`skill-name/SKILL.md` 目录格式、去重与容错）。
- 内置技能注册：`claude-code-run/src/skills/bundledSkills.ts` 与 `src/skills/bundled/index.ts`（启动期程序注册）。
- 插件技能读取：`claude-code-run/src/utils/plugins/loadPluginCommands.ts`（`skillsPath/skillsPaths` 与 `SKILL.md` 发现）。

6. 风险与回滚
- 若统一装载协议引发回归，可暂时回退到“内建工具 + 静态技能目录”的最小模式，并保留失败事件用于追查。

### WP3-C：统一注册面（对应 `wip3-04`）

- 目标：统一能力目录与查询接口。
- 产出：
  - `src/platform/integration/registry/types.ts`
  - `src/platform/integration/registry/adapter.ts`
  - `src/platform/integration/index.ts`（统一导出）
  - `src/application/query/query-runner.ts`（改为单入口消费可调用能力）
  - `src/__tests__/phase3_registry_adapter.test.ts`
- 验收：内建/外接能力同口径查询。

#### WP3-C 设计核心（必须先达成共识）

1. 为什么做（Why）
- 当前 `tools/registry`、MCP 生命周期、Plugin/Skill 装载结果分散在不同模块，主链路缺少统一“能力目录”，导致同一能力在“可见性、可调度性、来源标记”上口径不一致。
- `wip3-03` 已建立最小装载协议，`wip3-04` 需要把“已装载/已降级/已禁用”的状态统一映射为可查询注册面，供 query/runtime 单入口消费。

2. 问题与边界
- In Scope：统一能力描述模型、来源标记归一化、状态归一化、目录查询接口、query 侧单入口消费、最小冲突去重策略。
- Out of Scope：远端能力动态拉取、复杂优先级编排、跨节点注册同步、策略驱动路由（延期到 Extra-B）。

3. 核心设计
- 统一注册模型（最小字段）：
  - `capabilityId`（稳定主键，建议 `source:type:id`）
  - `name/type/source/loadedFrom?/version?/state/callable/reason?`
  - 其中 `reason` 复用 WP3-A/B 结构化语义（`source/module/reasonCode/userMessage/retryable/detail?`）。
- 数据来源与映射：
  - 内建工具：来自 `tools/registry`，默认 `source=builtin`、`state=ready`、`callable=true`。
  - MCP：来自 `McpLifecycleSnapshot`，`ready/degraded/disabled` 按状态映射为可调度性；`disabled` 必须 `callable=false`。
  - Plugin/Skill：来自 `PluginSkillLoaderSnapshot`，保留 `loadedFrom`（`bundled/skills/plugin`）；`loaded` 才可调用，`disabled` 明确不可调用。
- 状态归一化原则：
  - 统一对外状态集合建议为 `ready | degraded | disabled | discovered`，禁止每个来源暴露自定义枚举给上层。
  - 调度判定统一走 `callable`，避免调用侧重复理解来源特定状态机。
- 查询接口（统一注册面）：
  - `listCapabilities(filters?)`：按 `source/type/state/callable` 过滤。
  - `getCapability(capabilityId)`：单项查询，返回结构化状态与原因。
  - `listModelCallableTools()`：仅返回当前可提供给模型的工具 schema（供 `query-runner` 使用）。
- 主链路接线约束：
  - `query-runner` 不再直接拼接多来源工具集合，改为只依赖 registry adapter 输出。
  - 调用执行前做一次 `callable` 断言；若不可调用，返回结构化拒绝（`reasonCode=registry_not_callable`）。
- 冲突与去重：
  - 同名不同来源不覆盖，通过 `capabilityId` 区分。
  - 模型工具名冲突时遵循“内建优先、外接保留但不抢占”策略，并输出冲突审计事件。
- 可观测性：
  - 每次注册面重建输出一次摘要事件（来源计数、可调用计数、禁用计数、冲突计数），用于阶段验收与回归追查。

4. 验证 Case（DoD）
- `REG-001` 内建工具与外接能力（MCP/Plugin/Skill）可在同一接口查询，且来源标记正确。
- `REG-002` 禁用项（MCP disabled / Plugin disabled）仍可查询但 `callable=false`，并附结构化原因。
- `REG-003` 同名冲突场景下不发生覆盖，目录可返回两条能力并给出稳定 `capabilityId`。
- `REG-004` `query-runner` 仅通过 registry adapter 获取模型可调用工具，不再直接依赖分散来源集合。
- `REG-005` 关闭统一注册面开关时可回退到“仅内建 registry”，且 `phase1_*`、`phase2_*` 回归无新增失败。

5. 对标参考（统一注册与聚合）
- 命令/技能多来源聚合：`claude-code-run/src/commands.ts`（`getSkills/loadAllCommands/getSkillToolCommands`）。
- 工具池单入口合并：`claude-code-run/src/tools.ts`（`assembleToolPool/getMergedTools`）。
- 当前接入层基线：`rewrite/src/platform/integration/index.ts`、`mcp/*`、`plugin/*`。

6. 风险与回滚
- 风险 1：状态映射不一致导致“可见但不可调度”误判。
  - 回滚：切回“内建 registry + 外接只观测不调度”模式。
- 风险 2：工具排序变化影响 prompt cache 稳定性。
  - 回滚：固定注册输出顺序（内建优先），必要时回退旧工具集合构造路径。
- 风险 3：冲突处理策略变更触发行为回归。
  - 回滚：保持“内建优先”不变，仅记录冲突并禁用外接同名能力。

### WP3-D：最小安全与隔离（对应 `wip3-05`）

- 目标：补齐外接能力最小边界控制。
- 产出：
  - `src/platform/integration/security/types.ts`
  - `src/platform/integration/security/guard.ts`
  - `src/platform/integration/security/circuit-breaker.ts`
  - `src/__tests__/phase3_integration_security.test.ts`
- 验收：异常扩展可按 provider/plugin 粒度熔断，不拖垮主链路。

#### WP3-D 设计核心（必须先达成共识）

1. 为什么做（Why）
- `wip3-02~04` 已打通“可发现/可装载/可注册”，但“哪些外接能力可进入可调用面”仍缺最小统一门。
- 若没有 provider/plugin 级熔断，异常外接项会在主链路持续重试，放大延迟与失败噪音。

2. 问题与边界
- In Scope：来源校验、协议限制、最小权限默认值、provider/plugin 级熔断、结构化拒绝原因、审计事件。
- Out of Scope：签名体系、供应链 attestation、细粒度 RBAC、复杂凭据轮换、多租户隔离（延期到 Extra-B）。

3. 核心设计
- 最小安全门（Security Guard）：
  - 输入：`McpLifecycleSnapshot`、`PluginSkillLoaderSnapshot`、`externalCapabilities`。
  - 输出：`allow | deny | degrade` 决策与结构化原因（复用 `source/module/reasonCode/userMessage/retryable/detail?`）。
  - 决策维度：
    - 来源校验：`providerId/pluginId/itemId` 必须稳定且可追踪，未知来源默认 `deny`。
    - 协议限制：Phase 3 仅允许最小 transport/协议集合；不在白名单直接拒绝。
    - 最小权限：外接能力默认“可见但不可调度”，仅通过安全门后才可设置 `callable=true`。
- 熔断器（Circuit Breaker）：
  - 统计粒度：`mcp:<providerId>`、`plugin:<pluginId>`。
  - 开启条件：连续失败达到阈值（建议 3）后进入 `open`，并映射为 `state=disabled/callable=false`。
  - 恢复条件：冷却窗口后进入 `half-open` 试探；成功则 `closed`，失败回 `open`。
  - 与主链路关系：熔断后仅禁用该 provider/plugin，不影响内建工具与其他外接项。
- 接线约束：
  - `registry adapter` 在构建 callable 工具池前必须消费安全门与熔断快照。
  - 拒绝原因必须可透传到 `resolveToolCall` 返回值，避免上层丢失安全语义。
- 可观测性：
  - 事件建议：`integration_security_guard_decided`、`integration_circuit_state_changed`。
  - 每次重建输出安全摘要：拒绝数、降级数、熔断开启数、恢复数。

4. 验证 Case（DoD）
- `SEC-001` 非可信来源（未知 provider/plugin）不会进入可调用面，且返回结构化拒绝原因。
- `SEC-002` 非允许协议/transport 的外接能力被拒绝，`reasonCode` 可用于审计检索。
- `SEC-003` 单一 provider/plugin 连续异常触发熔断后，其他 provider/plugin 与内建工具仍可正常调度。
- `SEC-004` 熔断项在冷却后可试探恢复；恢复失败会重新打开熔断，不会造成主链路雪崩重试。

5. 对标参考（安全边界）
- Phase 2 边界硬化：`src/platform/permission/boundary.ts`（协议/路径/网络最小拒绝语义）。
- 风险分级：`src/platform/permission/risk.ts`（reason code 分类口径）。
- 接入状态来源：`src/platform/integration/mcp/*`、`src/platform/integration/plugin/*`。
- 注册面消费点：`src/platform/integration/registry/adapter.ts`、`src/application/query/tool-orchestrator.ts`。

6. 风险与回滚
- 风险 1：安全门误拦截导致可用能力下降。
  - 回滚：临时降级为“审计模式”（只记录不拦截），并保留拒绝事件用于修正规则。
- 风险 2：熔断阈值过低导致抖动。
  - 回滚：调高阈值与冷却窗口，必要时切换为“仅手动禁用”策略。
- 风险 3：拒绝语义与 Phase 2 reason code 不一致，影响排障。
  - 回滚：统一 reasonCode 字典到 `permission/boundary` 口径，保留兼容映射层。

### WP3-E：阶段收口与延期交接（对应 `wip3-06`）

- 目标：形成可重复验收、文档回写与延期项交接。
- 产出：验收报告、回滚预案、主路线图更新、Deferred 清单。
- 验收：Phase 3 专项门禁全绿，且延期项均映射到 Phase Extra-B。

### WP3-F：最小可视化接线（对应 `wip3-07`）

- 目标：提供统一注册面的最小可视化视图，提升联调和回归定位效率。
- 产出：
  - `src/platform/integration/registry/graph.ts`
  - `src/application/query/context-view.ts`（新增 integration graph 读取入口）
  - `src/__tests__/phase3_registry_graph.test.ts`
- 验收：可视化输出能展示来源、状态、可调用性与冲突摘要。

#### WP3-F 设计核心（必须先达成共识）

1. 为什么做（Why）
- 当前接入问题排查主要依赖 trace 和文本快照，信息密度高但不直观，联调效率偏低。

2. 问题与边界
- In Scope：最小只读视图（图结构或树结构 JSON）、冲突高亮、来源统计。
- Out of Scope：复杂前端控制台、实时流式拓扑动画、跨节点集群视图（延期到 Extra-B）。

3. 核心设计
- 输入：`registry adapter` 当前快照。
- 输出：`nodes + edges + summary` 三段结构，节点至少包含 `capabilityId/source/type/state/callable`。
- 冲突表达：同 tool name 多来源冲突以 `conflictGroup` 聚合，内建优先策略显式可见。
- 可观测性：每次图快照生成写一次轻量事件 `integration_registry_graph_snapshot`。

4. 验证 Case（DoD）
- `VIS-001` 能输出内建与外接统一接线图，不丢失来源标记。
- `VIS-002` 禁用项在图中可见且 `callable=false`。
- `VIS-003` 同名冲突可在 `conflictGroup` 中聚合展示。
- `VIS-004` 无外接能力时退化为“仅内建图”，不报错。

## Deferred to Phase Extra-B（Integration Advanced）

1. 多 transport 扩展（`stdio/http/sse/ws`）与连接池治理。
2. 复杂鉴权矩阵（OAuth/XAA/企业代理）与凭据轮换。
3. 规模化连接治理（批量预热、并发控制、SLO 与熔断策略）。
4. 企业策略包（来源白名单、版本签名、供应链增强）。
5. 生态扩展模板（新增外部能力接入脚手架与准入检查）。

## 依赖与并行策略

1. 串行主链：`wip3-01 -> wip3-02 -> wip3-03 -> wip3-04 -> wip3-05 -> wip3-06`
2. 并行项：`wip3-03` 与 `wip3-04` 可并行评审接口草案；`wip3-07` 在 `wip3-04` 后可并行于 `wip3-05`。
3. 前置门：进入实现前必须完成 `wip3-01` 对标结论冻结。

## 里程碑

1. M3-1（最小外部通路可运行）：完成 `wip3-02`
2. M3-2（装载与注册可治理）：完成 `wip3-03 + wip3-04`
3. M3-3（接线可视与最小安全可验证）：完成 `wip3-05 + wip3-07`
4. M3-4（阶段收口与延期交接）：完成 `wip3-06`

## 建议验收命令（草案）

1. `bun run build`
2. `bunx tsc --noEmit`
3. `bun run lint`
4. `bun test src/__tests__/phase3*.test.ts`
5. `bun test src/__tests__/phase1*.test.ts src/__tests__/phase2*.test.ts`
