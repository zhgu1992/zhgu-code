# Phase Extra-B - Integration Advanced（MCP/集成专项）

- Status: Not Started
- Updated: 2026-04-13
- Parent: [Phase Extra 总览](./README.md)

## 启动前对标结论（B 轨必填）

- 对标状态: Pending（未完成对标，禁止进入实现）
- 对标日期: 待执行（启动当日填写）
- 对标范围: MCP / Plugin / Skill / Transport / Enterprise Policy
- 参考源码（启动时逐项核对）:
  - `claude-code-run/src/services/mcp/*`
  - `claude-code-run/src/services/plugins/*`
  - `rewrite/src/platform/integration/*`
  - `rewrite/src/observability/*`

### 基线结论（待对标完成后冻结）

1. 已对齐项:
- 暂无（待对标完成后补齐）。
2. 差异项:
- 能力覆盖: Phase 3 延期的重型接入能力尚未形成治理闭环。
- 稳定性: 多 transport 并发与复杂鉴权场景回退路径不足。
- 可观测性: 连接治理、来源策略、故障恢复缺少统一门禁。
- 安全边界: 企业来源策略、签名校验与封禁边界未冻结。
3. 本阶段范围:
- In Scope: MCP/Plugin/Skill 重型接入、transport 抽象、企业策略治理。
- Out of Scope: Provider 主平面重构、非 Extra 范围的大规模架构迁移。

## 目标

1. 承接并收敛 Phase 3 Deferred 接入能力。
2. 建立多 transport 与复杂鉴权的统一编排。
3. 建立规模化连接治理与企业策略门禁。

前置约束：
1. 先消费 [Phase 3 README](../phase-3/README.md) 中 Deferred to Extra-B 清单。
2. Deferred 映射不完整时，禁止进入实现。

## WIP 执行门禁记录（B 轨）

| WIP | 为什么做 + 问题与边界 | 超越目标 | 核心设计 | 验证Case/DoD | 风险回滚 | 状态 |
|---|---|---|---|---|---|---|
| `wipx-05` Extra-B 延期接入能力接盘 | Phase 3 延期项若无统一承接会分散落地 | 把重型接入能力纳入统一治理轨道 | 建立 Deferred -> Work Package 映射表 | `INTX-001~003` 通过 | 映射不完整则不进入实现 | Pending |
| `wipx-06` Extra-B 多 transport 与复杂鉴权 | 多协议接入与鉴权矩阵复杂度高 | 统一 transport 抽象与鉴权编排 | `stdio/http/sse/ws` + OAuth/XAA 策略矩阵 | `INTX-004~009` 通过 | 回退到 Phase 3 最小通路 | Pending |
| `wipx-07` Extra-B 规模化连接治理与企业策略 | 大规模连接与企业约束缺统一门禁 | 建立连接治理与企业策略包 | 连接池治理、并发控制、来源白名单、签名校验 | `INTX-010~015` 通过 | 回退到最小来源校验 + 手动禁用 | Pending |

## B 轨完成标准（DoD）

1. Deferred 项全部映射到可执行 Work Package。
2. 多 transport + 鉴权矩阵具备 feature flag 与一键回退。
3. 连接治理指标可观测（连接成功率、故障恢复时间、误封禁率）。
4. 不破坏 Phase 3 最小闭环与 `phase1_* ~ phase5_*` 前置门。

## 依赖与执行顺序（B 轨）

1. `wipx-05 -> wipx-06 -> wipx-07`
2. 可与 Extra-A 并行，但不可绕过总览中的 `wipx-01`/`wipx-09`。

## 里程碑（B 轨）

1. MX-B1（Deferred 映射完成）：完成 `wipx-05`
2. MX-B2（transport/鉴权矩阵可运行）：完成 `wipx-06`
3. MX-B3（规模化治理可验收）：完成 `wipx-07`

## 建议验收命令（B 轨草案）

1. `bun run build`
2. `bunx tsc --noEmit`
3. `bun run lint`
4. `bun test src/__tests__/phase-extra*.test.ts`
5. `bun test src/__tests__/phase3*.test.ts`
