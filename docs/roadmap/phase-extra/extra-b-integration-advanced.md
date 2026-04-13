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

## Deferred 映射消费状态（来自 Phase 3 收口包）

来源文档：`docs/roadmap/phase-3/phase3-deferred-map.md`

| Deferred ID | Item | Target WIP | Current Status |
|---|---|---|---|
| `DEF-001` | 多 transport 扩展与连接池治理 | `wipx-06` | Ready |
| `DEF-002` | 复杂鉴权矩阵与凭据轮换 | `wipx-06` | Ready |
| `DEF-003` | 规模化连接治理（批量预热/并发/SLO） | `wipx-07` | Ready |
| `DEF-004` | 企业策略包（白名单/签名/供应链） | `wipx-07` | Ready |
| `DEF-005` | 生态扩展模板与准入检查 | `wipx-05` | Ready |

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

## 追加记录：Skill 可用性缺口（rewrite 现状）

- 记录日期：2026-04-13
- 背景：用户在 `~/.claude/skills/` 下已有 skill（如 `tdd-workflow`），但在 `rewrite` 运行时“可见不可用”。

### 现象与根因（已确认）

1. 概念混淆：当前 CLI 对外主要展示的是 tools（9 个 builtin tool），不是可执行 skill 体系。
2. 扫描范围有限：runtime 仅扫描 `<cwd>/.claude/skills` 与 `~/.claude/skills` 的一层目录（`<skill>/SKILL.md`）。
3. 默认安全拒绝：`trustedSkills` 默认空集合，skill 会被标记 `security_untrusted_source`，因此 `callable=false`。
4. 执行链未接通：当前实现以 integration 元数据为主（可扫描/可观测），尚未把 `SKILL.md` 内容稳定注入到 query 执行链，导致“识别到 skill 节点”不等于“可触发 skill 能力”。
5. 快照认知偏差：`integration graph` 默认读取 trace 最新快照；若会话/trace 未更新，可能看到旧 skill 名称。已补充 `integration graph --latest` 用于读取最新原始快照事件。

### 对应代码位置（用于后续开发）

1. skill 目录解析：`rewrite/src/platform/integration/runtime-input.ts`
2. skill 目录扫描与 `SKILL.md` 校验：`rewrite/src/platform/integration/plugin/loader.ts`
3. skill 信任判定：`rewrite/src/platform/integration/security/guard.ts`
4. integration 快照视图：`rewrite/src/application/query/context-view.ts`
5. CLI 快照入口：`rewrite/src/cli/index.ts`

### 纳入 Extra-B 的后续任务（建议）

1. INTX-SKILL-001（信任策略落地）
- 目标：增加可配置 `trustedSkills`（支持显式白名单或开发模式策略），避免默认全部拒绝。
- 验收：指定 skill（如 `tdd-workflow`）可从 `callable=false` 变为 `callable=true`，并保留审计日志。

2. INTX-SKILL-002（Skill 执行链接入）
- 目标：把已授权 skill 的 `SKILL.md` 内容接入 query 构建链（至少支持单 skill 命中注入）。
- 验收：输入“使用 tdd-workflow …”时，trace 中能看到 skill 命中与注入证据，并对模型行为产生可验证影响。

3. INTX-SKILL-003（可观测与自检命令）
- 目标：提供 skills 专用可观测命令（区分 tools 与 skills），并展示 trust/callable/reason。
- 验收：一条命令可列出当前 skills 的 `name/state/callable/reason/loadedFrom/updatedAt`。

4. INTX-SKILL-004（误读防护）
- 目标：在 CLI 文案中显式区分“tool 列表”和“skill 列表”，避免误解“9 tools = 9 skills”。
- 验收：用户查询“我有哪些 skill”时返回 skill 维度数据，不再输出 tool 维度替代结果。

## 建议验收命令（B 轨草案）

1. `bun run build`
2. `bunx tsc --noEmit`
3. `bun run lint`
4. `bun test src/__tests__/phase-extra*.test.ts`
5. `bun test src/__tests__/phase3*.test.ts`
