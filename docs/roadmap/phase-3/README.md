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

## 阶段完成标准（DoD）

1. 至少一条 MCP/Plugin/Skill 外部能力通路稳定可用。
2. 接入失败具备结构化错误和可追溯事件。
3. 统一注册面可同时查询内建与外接能力元数据。
4. `build/type/lint/test` 全绿，且不引入前置 Phase 回归。
5. 输出阶段回对标结论、风险豁免记录与“Deferred to Extra-B”清单。

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
- 产出：registry adapter 与来源标记。
- 验收：内建/外接能力同口径查询。

### WP3-D：最小安全与隔离（对应 `wip3-05`）

- 目标：补齐外接能力最小边界控制。
- 产出：来源校验、协议限制、最小权限与熔断策略。
- 验收：异常扩展可按 provider/plugin 粒度熔断，不拖垮主链路。

### WP3-E：阶段收口与延期交接（对应 `wip3-06`）

- 目标：形成可重复验收、文档回写与延期项交接。
- 产出：验收报告、回滚预案、主路线图更新、Deferred 清单。
- 验收：Phase 3 专项门禁全绿，且延期项均映射到 Phase Extra-B。

## Deferred to Phase Extra-B（Integration Advanced）

1. 多 transport 扩展（`stdio/http/sse/ws`）与连接池治理。
2. 复杂鉴权矩阵（OAuth/XAA/企业代理）与凭据轮换。
3. 规模化连接治理（批量预热、并发控制、SLO 与熔断策略）。
4. 企业策略包（来源白名单、版本签名、供应链增强）。
5. 生态扩展模板（新增外部能力接入脚手架与准入检查）。

## 依赖与并行策略

1. 串行主链：`wip3-01 -> wip3-02 -> wip3-03 -> wip3-04 -> wip3-05 -> wip3-06`
2. 并行项：`wip3-03` 与 `wip3-04` 可并行评审接口草案。
3. 前置门：进入实现前必须完成 `wip3-01` 对标结论冻结。

## 里程碑

1. M3-1（最小外部通路可运行）：完成 `wip3-02`
2. M3-2（装载与注册可治理）：完成 `wip3-03 + wip3-04`
3. M3-3（最小安全隔离可验证）：完成 `wip3-05`
4. M3-4（阶段收口与延期交接）：完成 `wip3-06`

## 建议验收命令（草案）

1. `bun run build`
2. `bunx tsc --noEmit`
3. `bun run lint`
4. `bun test src/__tests__/phase3*.test.ts`
5. `bun test src/__tests__/phase1*.test.ts src/__tests__/phase2*.test.ts`
