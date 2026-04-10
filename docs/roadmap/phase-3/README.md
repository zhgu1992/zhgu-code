# Phase 3 - Integration Plane

- Status: Not Started
- Updated: 2026-04-10

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
- 能力覆盖: 待对标确认（MCP 生命周期、Plugin/Skill 装载协议、统一注册面）。
- 稳定性: 待对标确认（连接重试、故障隔离、禁用回退）。
- 可观测性: 待对标确认（接入失败原因与事件链路）。
- 安全边界: 待对标确认（来源可信度、版本校验、权限约束）。
- 复杂度: 待对标确认（接入层与 Query 核心耦合度）。
3. 本阶段范围:
- In Scope: 接入协议、生命周期、统一注册面
- Out of Scope: 完整任务编排与业务特性扩展

## 目标

建立 MCP/Plugin/Skill 能力接入层，让“能力扩展”可治理、可回退、可观测。

## 超越基线讨论（必填）

> 原则：对标源码只定义底线，不定义上限。

### 1) 超越方向

1. 接入解耦优先：接入层不侵入 Query 主链路。
2. 生命周期治理优先：发现、鉴权、启停、故障恢复统一流程化。
3. 失败可解释优先：接入失败必须可定位到模块与原因。

### 2) 超越指标

1. 至少 1 条外部能力通路稳定可用（连续 20 次调用成功率 >= 99%）。
2. 接入失败 100% 返回结构化错误（`source/module/reasonCode/userMessage`）。
3. Plugin/Skill 禁用与回退路径覆盖率 100%（以测试 case 为准）。
4. 接入层新增测试至少 20 条 case，且不引入 `phase1_*` 与 `phase2_*` 回归失败。

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
| `wip3-02` MCP 生命周期管理 | 缺少连接发现/鉴权/可用性统一流程 | 把连接生命周期收敛到平台层统一状态机 | 新增 MCP lifecycle manager 与状态模型 | `MCP-001~006` 通过 | 保留静态配置直连兜底 | Pending |
| `wip3-03` Plugin/Skill 装载协议 | 装载元数据与禁用策略未统一 | 统一 manifest 校验、版本约束、禁用回退 | 新增 loader/validator 与错误语义 | `PLG-001~006` 通过 | 装载失败降级为禁用该项 | Pending |
| `wip3-04` 统一工具注册面 | 内建与外接能力注册口径分离 | 同一目录输出能力元数据与来源标记 | 新增统一 registry adapter | `REG-001~005` 通过 | 回退到内建 registry | Pending |
| `wip3-05` 安全与隔离策略 | 外接能力边界缺少统一约束 | 降低恶意/异常扩展对主链路影响 | 来源校验、协议校验、权限最小化 | `SEC-001~006` 通过 | 开关禁用外接能力 | Pending |
| `wip3-06` 收口验收与文档回写 | 缺少阶段级验收与回滚记录 | 形成可重复验收和风险豁免模板 | 汇总测试、对标结论、回滚脚本 | `phase3_* + 前置门` 全绿 | 未达标不推进 Phase 4/5 | Pending |

## 阶段完成标准（DoD）

1. 至少一条 MCP/Plugin/Skill 外部能力通路稳定可用。
2. 接入失败具备结构化错误和可追溯事件。
3. 统一注册面可同时查询内建与外接能力元数据。
4. `build/type/lint/test` 全绿，且不引入前置 Phase 回归。
5. 输出阶段回对标结论与风险豁免记录。

## 工作包（Work Packages）

### WP3-A：MCP 生命周期管理（对应 `wip3-02`）

- 目标：建立 MCP 连接生命周期状态机与治理策略。
- 产出：
  - `src/platform/integration/mcp/lifecycle.ts`
  - `src/platform/integration/mcp/types.ts`
  - `src/__tests__/phase3_mcp_lifecycle.test.ts`
- 验收：发现、鉴权、可用性检测、故障恢复路径可测试。

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
- `MCP-002` 鉴权失败进入 `disabled` 并输出结构化原因。
- `MCP-003` 短暂网络错误进入 `degraded` 并可恢复到 `ready`。
- `MCP-004` 重试耗尽后进入 `disabled`。
- `MCP-005` 禁用后不会再被调度。
- `MCP-006` 生命周期事件可回放。

5. 风险与回滚
- 生命周期接线回归时，可回退到静态单连接模式。

### WP3-B：Plugin/Skill 装载协议（对应 `wip3-03`）

- 目标：定义并实现统一装载协议。
- 产出：manifest 校验器、版本策略、禁用与回退机制。
- 验收：装载成功与失败路径均可断言。

### WP3-C：统一注册面（对应 `wip3-04`）

- 目标：统一能力目录与查询接口。
- 产出：registry adapter 与来源标记。
- 验收：内建/外接能力同口径查询。

### WP3-D：安全与隔离（对应 `wip3-05`）

- 目标：补齐外接能力边界控制。
- 产出：来源校验、协议限制、权限最小化策略。
- 验收：异常扩展不会拖垮主链路。

### WP3-E：阶段收口（对应 `wip3-06`）

- 目标：形成可重复验收与文档回写。
- 产出：验收报告、回滚预案、主路线图更新。
- 验收：Phase 3 专项门禁全绿。

## 依赖与并行策略

1. 串行主链：`wip3-01 -> wip3-02 -> wip3-03 -> wip3-04 -> wip3-05 -> wip3-06`
2. 并行项：`wip3-03` 与 `wip3-04` 可并行评审接口草案。
3. 前置门：进入实现前必须完成 `wip3-01` 对标结论冻结。

## 里程碑

1. M3-1（生命周期可运行）：完成 `wip3-02`
2. M3-2（装载与注册可治理）：完成 `wip3-03 + wip3-04`
3. M3-3（安全隔离可验证）：完成 `wip3-05`
4. M3-4（阶段收口）：完成 `wip3-06`

## 建议验收命令（草案）

1. `bun run build`
2. `bunx tsc --noEmit`
3. `bun run lint`
4. `bun test src/__tests__/phase3*.test.ts`
5. `bun test src/__tests__/phase1*.test.ts src/__tests__/phase2*.test.ts`
