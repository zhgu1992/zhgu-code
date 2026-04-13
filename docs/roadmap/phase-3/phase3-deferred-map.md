# Phase 3 Deferred Map（WP3-E 冻结）

- Date: 2026-04-13
- Source WIP: `wip3-06`
- Target Track: Phase Extra-B (`wipx-05/06/07`)

## Deferred -> Extra-B Mapping

| Deferred ID | Deferred Item | Risk | Extra-B Target | Entry Conditions | Rollback Baseline | Owner | Status |
|---|---|---|---|---|---|---|---|
| `DEF-001` | 多 transport 扩展（`stdio/http/sse/ws`）与连接池治理 | High | `wipx-06` | `WP3-A` 生命周期快照稳定；`WP3-D` 熔断快照可追溯 | 回退到 Phase 3 单最小通路 | integration-owner | mapped |
| `DEF-002` | 复杂鉴权矩阵（OAuth/XAA/企业代理）与凭据轮换 | High | `wipx-06` | `WP3-D` 来源校验语义冻结；最小拒绝语义可追溯 | 回退到最小来源校验 + 手动禁用 | security-owner | mapped |
| `DEF-003` | 规模化连接治理（批量预热、并发控制、SLO 与熔断策略） | Medium | `wipx-07` | `WP3-A/WP3-D` 状态与熔断事件稳定产出 | 回退到 provider/plugin 粒度熔断 | reliability-owner | mapped |
| `DEF-004` | 企业策略包（来源白名单、版本签名、供应链增强） | High | `wipx-07` | 安全门决策结构冻结；Phase 3 默认 deny 行为稳定 | 回退到 Phase 3 默认 deny + 审计 | platform-security-owner | mapped |
| `DEF-005` | 生态扩展模板（接入脚手架与准入检查） | Medium | `wipx-05` | `WP3-B/WP3-C` 最小装载与注册协议冻结 | 回退到手工接入清单流程 | ecosystem-owner | mapped |

## Rationale Snapshot

- Why deferred: Phase 3 目标是最小闭环，重型 transport/鉴权/企业策略会显著增加复杂度与回归面。
- Risk if not deferred: 收口延迟、边界漂移、与 Phase 4/5 主链路耦合上升。
- Expected benefit: 在 Extra-B 以独立门禁和回滚框架集中交付，避免主线污染。
