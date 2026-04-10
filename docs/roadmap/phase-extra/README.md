# Phase Extra - Advanced Modules（后置复杂模块）

- Status: Not Started
- Updated: 2026-04-10

## 启动前对标结论（必填）

- 对标状态: Pending（未完成对标，禁止进入实现）
- 对标日期: 待执行（启动当日填写）
- 对标范围: Context Compression / Overflow Recovery / Future Advanced Modules
- 参考源码（启动时逐项核对）:
  - `claude-code-run/src/query.ts`
  - `claude-code-run/src/query/tokenBudget.ts`
  - `claude-code-run/src/services/compact/*`
  - `claude-code-run/src/services/contextCollapse/*`
  - `rewrite/src/application/query/*`
  - `rewrite/src/observability/*`

### 基线结论（待对标完成后冻结）

1. 已对齐项:
- 暂无（待对标完成后补齐）。
2. 差异项:
- 能力覆盖: 压缩策略、溢出恢复、压缩质量评估尚未形成闭环。
- 稳定性: 长会话在高负载场景缺少完整回退与熔断策略。
- 可观测性: context 治理事件与质量指标未形成阶段化门禁。
- 安全边界: 自动压缩与策略切换的风险边界未冻结。
- 复杂度: 多策略并存时缺少统一编排与灰度机制。
3. 本阶段范围:
- In Scope: 后置复杂模块（首个模块为 context 压缩治理）
- Out of Scope: 主架构主链路重构（Query/Permission/Orchestrator 主干改造）

## 目标

作为 Phase 5 之后的“复杂能力缓冲层”，承接独立模块化的高复杂度工作，首批聚焦 context 压缩与恢复策略。

前置约束：
1. 先完成 [Phase 2.5 - Context Monitoring Plane](../phase-2-5/README.md)。
2. 优先消费 Phase 2.5 输出的 [Compression TODO Pack](../phase-2-5/compression-todo-pack.md)，再进入压缩实现。

## 超越基线讨论（必填）

> 原则：主干先稳定、复杂能力后置、模块可插拔。

### 1) 超越方向

1. 模块解耦优先：复杂能力以独立模块形态接入，不反向污染主架构。
2. 灰度可控优先：新策略必须可按开关分级启停并可快速回滚。
3. 质量评估优先：压缩不是“能跑就行”，必须可量化评估收益与副作用。

### 2) 超越指标

1. Phase Extra 模块全部支持 feature flag 与一键回退。
2. 每个模块必须有独立验收包（测试 + 指标 + 回滚）。
3. 任一 Extra 模块引入后，不得破坏 `phase1_* ~ phase5_*` 前置门。
4. context 压缩模块需具备“成功率、恢复率、误伤率”三类指标。

### 3) 创新工作轨

1. SXE-1 模块入口规范：定义“新增复杂模块”的统一接入模板。
2. SXE-2 策略实验沙箱：支持策略 shadow mode 与可比较指标输出。

### 4) 风险与回滚策略

1. 任一 Extra 模块异常时，立即回退为“监控-only”模式。
2. 若主链路稳定性下降，冻结 Extra 迭代并回滚最近策略变更。

## WIP 执行门禁记录（必填）

执行规则：当进入“执行小步骤”或“讨论 wipxxx”时，若未完成门禁讨论，先补讨论再实现。
门禁新增要求：`为什么做 + 问题与边界` 为必填；未补齐不得从 `Pending` 进入 `In Progress`。

| WIP | 为什么做 + 问题与边界 | 超越目标 | 核心设计 | 验证Case/DoD | 风险回滚 | 状态 |
|---|---|---|---|---|---|---|
| `wipx-01` 对标与门禁基线 | Extra 阶段需要统一承接复杂模块，避免临时插单 | 固化“后置复杂模块”准入规则与文档模板 | 完成对标结论、里程碑、执行与回滚框架 | 文档可直接排期且门禁字段完整 | 不通过仅回退文档 | Pending |
| `wipx-02` Context 压缩策略编排 | 压缩策略复杂，独立模块化更稳妥 | 把压缩策略做成可插拔策略层 | `snip/micro/auto/reactive/collapse` 策略入口统一 | `CTXC-001~008` 通过 | 开关回退监控-only | Pending |
| `wipx-03` Overflow 恢复与熔断 | 高负载场景易循环失败 | 建立溢出恢复链与失败熔断保护 | `overflow -> recover -> retry/stop` 明确状态与预算 | `CTXR-001~007` 通过 | 熔断后强制降级 stop-only | Pending |
| `wipx-04` 压缩质量评估门 | 缺少“压缩是否有效”的量化口径 | 建立质量基线与回归门禁 | 成功率/恢复率/误伤率指标 + 验收命令 | `CTXQ-001~006` 通过 | 指标不达标不放量 | Pending |
| `wipx-05` Future 模块扩展位 | 后续复杂项缺少落位策略 | 把后续复杂功能统一纳入 Extra | 新增模块接入模板与准入条件 | `XMOD-001~004` 通过 | 不满足准入不允许入场 | Pending |
| `wipx-06` 阶段收口与主路线回写 | 缺少 Extra 阶段收口机制 | 形成可持续迭代的复杂模块池 | 汇总验证证据、风险豁免、回滚清单 | `phase-extra_* + 前置门` 全绿 | 未达标不并入默认策略 | Pending |

## 阶段完成标准（DoD）

1. Extra 模块有统一接入模板、验证模板、回滚模板。
2. context 压缩模块可灰度启停，并且可独立回滚。
3. 压缩质量评估可执行，结果可追溯。
4. 不引入 Phase 1~5 回归失败。
5. 完成主路线图与架构文档回写。

## 依赖与执行顺序

1. 前置依赖：Phase 1~5 主线完成，且 Phase 2.5 已完成并输出 TODO 交接包。
2. 串行主链：`wipx-01 -> wipx-02 -> wipx-03 -> wipx-04 -> wipx-05 -> wipx-06`
3. 并行项：`wipx-04` 可与 `wipx-05` 并行推进文档与工具链。

## 里程碑

1. MX-1（Extra 框架可运行）：完成 `wipx-01`
2. MX-2（压缩策略可灰度）：完成 `wipx-02 + wipx-03`
3. MX-3（质量门可执行）：完成 `wipx-04`
4. MX-4（复杂模块池生效）：完成 `wipx-05 + wipx-06`

## 建议验收命令（草案）

1. `bun run build`
2. `bunx tsc --noEmit`
3. `bun run lint`
4. `bun test src/__tests__/phase-extra*.test.ts`
5. `bun test src/__tests__/phase1*.test.ts src/__tests__/phase2*.test.ts src/__tests__/phase3*.test.ts src/__tests__/phase4*.test.ts src/__tests__/phase5*.test.ts`
