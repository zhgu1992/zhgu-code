# Phase 5 - 质量与发布平面执行拆解（Architecture Breakdown）

- Status: Pending
- Updated: 2026-04-14
- Owner: rewrite-quality-release
- Upstream Dependency: `phase-4/phase4-5-plan.md` 的 `G3` 放行门

## 1. 启动条件（必须满足）

进入 Phase 5 前必须满足：

1. Phase 4.5 `G3` 放行门通过（`phase5Blocked=false`）。
2. 已有 P45 证据包：成功流、拒绝流、漂移保护流事件样本。
3. Phase 4 收口不存在未关闭高危豁免。

## 2. Phase 5 目标

把“开发可跑”升级为“持续可交付”：

1. 本地与 CI 使用同一质量门命令集。
2. 测试分层、网络隔离、安全扫描都可阻断且可追溯。
3. 发布前验证与回滚可演练、可复用、可审计。

## 3. 执行总图（wip5-01~06 -> 切片）

串行主链：

1. `P5-S01~S03`（wip5-01）对标冻结
2. `P5-S04~S06`（wip5-02）质量门统一
3. `P5-S07~S09`（wip5-03）测试分层与隔离
4. `P5-S10~S12`（wip5-04）安全与依赖扫描
5. `P5-S13~S15`（wip5-05）发布验证与回滚
6. `P5-S16~S17`（wip5-06）阶段收口

并行策略：

1. `P5-S07` 与 `P5-S10` 可并行（均依赖 `S06`）。
2. `P5-S08` 与 `P5-S11` 可并行。
3. `P5-S14` 与 `P5-S15` 可并行。

## 4. 执行拆解（PR 级）

### P5-S01 源仓对标证据采集（wip5-01）

- Why: 未完成对标前直接实现会导致门禁口径漂移。
- Change Set:
1. 固化 `src/tests/.github/workflows` 对标证据清单。
2. 输出 rewrite 与源仓差异矩阵（能力、稳定性、可观测性、安全边界、复杂度）。
- 关键文件:
1. `rewrite/docs/roadmap/phase-5/README.md`
2. `rewrite/docs/roadmap/master-roadmap.md`
- Verification:
1. 文档内对标字段全部填充，不再是 `Pending/待执行`。
- Exit Criteria:
1. `对标状态` 从 `Pending` 变为冻结态。
2. 明确 In/Out Scope 与参考证据路径。
- Rollback: 仅回退文档，不触发代码回滚。

### P5-S02 差异闭环与优先级冻结（wip5-01）

- Why: 避免进入实现后频繁改门禁目标。
- Change Set:
1. 将差异项映射到 `wip5-02~06`。
2. 设定每个 WIP 的不可降级底线（阻断项）。
- 关键文件:
1. `rewrite/docs/roadmap/phase-5/README.md`
2. `rewrite/docs/roadmap/phase-5/phase5-execution-breakdown.md`
- Verification:
1. 每个 WIP 都有明确 Case ID 与阻断条件。
- Exit Criteria:
1. Phase 5 的“必须做”与“可延期”边界固定。
- Rollback: 恢复到上一个冻结版本并重新评审。

### P5-S03 Gate Contract 冻结（wip5-01）

- Why: 后续脚本和 CI 必须共享同一契约。
- Change Set:
1. 冻结 `quick-gate` 与 `release-gate` 命令矩阵。
2. 定义统一输出格式（`summary.json + logs`）。
- 关键文件:
1. `rewrite/docs/roadmap/phase-5/README.md`
2. `rewrite/docs/roadmap/phase-5/phase5-execution-breakdown.md`
- Verification:
1. 本地命令可按契约空跑（dry run）通过。
- Exit Criteria:
1. 任何门禁变更必须走文档更新和评审。
- Rollback: 暂时使用 README 草案命令，但禁止进入 release gate 实现。

### P5-S04 统一质量门脚本入口（wip5-02）

- Why: 解决“本地通过/CI 失败”的命令不一致问题。
- Change Set:
1. 新增统一 gate 脚本（quick/release）。
2. 失败统一 non-zero 退出，并输出结构化失败摘要。
- 关键文件:
1. `rewrite/scripts/quality-gate.sh`（新增）
2. `rewrite/scripts/release-gate.sh`（新增）
3. `rewrite/package.json`（新增脚本入口）
- Verification:
1. `bun run gate:quick`
2. `bun run gate:release`
- Exit Criteria:
1. 本地执行和 CI 执行命令完全一致。
- Rollback: 回退到原分散命令，但保留失败记录。

### P5-S05 CI Workflow 对齐统一门禁（wip5-02）

- Why: 让 CI 成为质量门的唯一执行放大器，而不是另一套逻辑。
- Change Set:
1. CI 改为调用统一 gate 脚本。
2. 失败归档到 artifacts。
- 关键文件:
1. `rewrite/.github/workflows/*.yml`
- Verification:
1. PR pipeline 使用 `gate:quick`。
2. Release pipeline 使用 `gate:release`。
- Exit Criteria:
1. CI 不再直接拼接临时命令。
- Rollback: workflow 回退到上一稳定版本。

### P5-S06 质量门回归测试（wip5-02）

- Why: 脚本门禁本身也需要可测试，防止“门禁失效”。
- Change Set:
1. 新增 `phase5_quality_gate.test.ts`。
2. 覆盖成功、失败、阻断、报告生成场景。
- 关键文件:
1. `rewrite/src/__tests__/phase5_quality_gate.test.ts`（新增）
- Verification:
1. `bun test src/__tests__/phase5_quality_gate.test.ts`
- Exit Criteria:
1. `QGT-001~006` 对应 case 可自动验证。
- Rollback: 保留脚本，暂时降级为手工校验。

### P5-S07 测试分层命名与命令规范（wip5-03）

- Why: 当前测试层次清晰度不够，定位效率受影响。
- Change Set:
1. 固化 unit/integration/e2e 标签或目录规范。
2. 为各层提供统一命令入口。
- 关键文件:
1. `rewrite/docs/testing-spec.md`
2. `rewrite/package.json`
- Verification:
1. `bun run test:unit`
2. `bun run test:integration`
3. `bun run test:e2e`
- Exit Criteria:
1. 测试失败可按层定位，不再混跑。
- Rollback: 回退到全量 `bun test`，并保留分层 TODO。

### P5-S08 网络隔离与稳定性策略（wip5-03）

- Why: 网络依赖是 flaky 主要来源。
- Change Set:
1. 定义默认无网络测试策略与 mock 策略。
2. 对需要联网的测试标记隔离层并默认不阻断 quick gate。
- 关键文件:
1. `rewrite/src/__tests__/*`（新增/调整标记）
2. `rewrite/docs/roadmap/phase-5/README.md`
- Verification:
1. 离线环境 quick gate 稳定通过。
2. release gate 可选择性执行联网层并留证据。
- Exit Criteria:
1. flaky 占比稳定 < 2%（滚动口径）。
- Rollback: 联网层临时降级为告警并留痕。

### P5-S09 测试证据与重跑策略（wip5-03）

- Why: 失败后要可复现、可重跑、可定位。
- Change Set:
1. 定义失败重跑策略（仅允许一次自动重跑或显式手动重跑）。
2. 输出失败摘要与复现命令。
- 关键文件:
1. `rewrite/scripts/test-report.sh`（新增，可选）
2. `rewrite/docs/roadmap/phase-5/README.md`
- Verification:
1. 失败 case 能导出复现命令。
- Exit Criteria:
1. 失败定位时间可控并可审计。
- Rollback: 关闭自动重跑，仅保留手动策略。

### P5-S10 依赖安全扫描接入（wip5-04）

- Why: 当前安全扫描未成为硬门。
- Change Set:
1. 接入依赖漏洞扫描（SCA）并定义阈值。
2. 高危漏洞默认阻断 release gate。
- 关键文件:
1. `rewrite/scripts/security-scan.sh`（新增）
2. `rewrite/.github/workflows/*.yml`
- Verification:
1. `bun run gate:release` 包含安全扫描步骤。
- Exit Criteria:
1. `SECQ-001~005` 对应策略可执行。
- Rollback: 扫描异常时降级为告警，但自动生成风险单。

### P5-S11 Secret Scan 与基线管理（wip5-04）

- Why: 防止密钥泄露进入主干与发布物。
- Change Set:
1. 引入 secret scan 并支持 baseline 文件。
2. 新增误报豁免机制（需过期时间与审批人）。
- 关键文件:
1. `rewrite/scripts/secret-scan.sh`（新增）
2. `rewrite/docs/roadmap/phase-5/README.md`
- Verification:
1. 误报可豁免，真实泄露必须阻断。
- Exit Criteria:
1. 密钥泄露场景不可绕过 release gate。
- Rollback: secret scan 临时改 warning 并在一个迭代内修复。

### P5-S12 安全豁免治理（wip5-04）

- Why: 保证降级策略可追踪，不变成永久漏洞。
- Change Set:
1. 统一豁免模板（原因、负责人、过期时间、批准人）。
2. 过期豁免自动阻断。
- 关键文件:
1. `rewrite/docs/roadmap/phase-5/README.md`
2. `rewrite/docs/roadmap/phase-5/security-waivers.md`（新增，可选）
- Verification:
1. 过期豁免会触发 gate 失败。
- Exit Criteria:
1. 所有豁免均可追踪且可审计。
- Rollback: 仅允许低风险临时豁免并强制复盘。

### P5-S13 Release Checklist + Rollback Runbook（wip5-05）

- Why: 发布前验证和回滚需要标准化，否则恢复成本高。
- Change Set:
1. 固化发布前 checklist。
2. 固化“一键回退到最近稳定构建”的步骤。
- 关键文件:
1. `rewrite/docs/roadmap/phase-5/release-checklist.md`（新增）
2. `rewrite/docs/roadmap/phase-5/rollback-runbook.md`（新增）
- Verification:
1. 发布演练可以按 runbook 执行。
- Exit Criteria:
1. `REL-001~006` 可映射到具体步骤。
- Rollback: 使用当前人工流程，补齐演练记录后重试。

### P5-S14 发布演练（wip5-05）

- Why: 文档有效性必须通过演练验证。
- Change Set:
1. 进行至少一次完整 dry-run。
2. 记录故障注入与回滚耗时。
- 关键文件:
1. `rewrite/docs/roadmap/phase-5/release-drill-YYYYMMDD.md`（新增）
- Verification:
1. 演练中断后可在目标时间内回退。
- Exit Criteria:
1. 演练报告包含问题列表与修复项。
- Rollback: 暂停正式发布，先修 runbook。

### P5-S15 证据归档与检索（wip5-05）

- Why: 发布后需要可回放的质量证据链。
- Change Set:
1. 建立 gate/test/security/release 证据归档结构。
2. 增加索引文件便于检索。
- 关键文件:
1. `rewrite/docs/roadmap/phase-5/evidence/`（新增目录）
2. `rewrite/docs/roadmap/phase-5/evidence/index.md`（新增）
- Verification:
1. 任一发布都能定位到完整证据包。
- Exit Criteria:
1. 证据缺失即阻断阶段收口。
- Rollback: 回到人工归档，但禁止宣告 Phase 5 完成。

### P5-S16 阶段收口引擎（wip5-06）

- Why: 需要把“门禁全绿”从人工判断升级为可执行规则。
- Change Set:
1. 新增 Phase 5 closure 评估模块。
2. 定义 `PASS/PASS_WITH_WAIVER/FAIL` 判定规则。
- 关键文件:
1. `rewrite/src/application/phase5/closure.ts`（新增）
2. `rewrite/src/__tests__/phase5_closure.test.ts`（新增）
- Verification:
1. `bun test src/__tests__/phase5_closure.test.ts`
- Exit Criteria:
1. `phase5Blocked` 判定可机器执行。
- Rollback: 暂用手工收口，但不得标记 Done。

### P5-S17 路线图回写与长期运行机制（wip5-06）

- Why: 完成后必须沉淀到主路线图，否则后续维护失焦。
- Change Set:
1. 更新 `phase-5/README.md`、`master-roadmap.md`、阶段指标。
2. 固化长期运营节奏（周度门禁复盘、月度豁免清理）。
- 关键文件:
1. `rewrite/docs/roadmap/phase-5/README.md`
2. `rewrite/docs/roadmap/master-roadmap.md`
- Verification:
1. 关键指标与命令入口完整可查。
- Exit Criteria:
1. Phase 5 状态可从 `In Progress` 进入 `Done`。
- Rollback: 回退文档状态并维持 `In Progress`。

## 5. Quick Gate / Release Gate 契约（建议冻结版）

Quick Gate（PR 阶段，快速阻断）:

1. `bunx tsc --noEmit`
2. `bun run lint`
3. `bun test src/__tests__/phase1*.test.ts src/__tests__/phase2*.test.ts src/__tests__/phase3*.test.ts src/__tests__/phase4*.test.ts`
4. `bun test src/__tests__/phase5_quality_gate.test.ts`

Release Gate（发布阶段，全量阻断）:

1. `bun run build`
2. `bunx tsc --noEmit`
3. `bun run lint`
4. `bun test`
5. `bun run gate:security`（SCA + secret scan）
6. `bun run gate:release:verify`（发布前检查与证据归档）

统一输出：

1. `artifacts/gates/<timestamp>/summary.json`
2. `artifacts/gates/<timestamp>/logs/*.log`
3. `artifacts/gates/<timestamp>/waivers.json`

## 6. 阶段门禁（Phase 5）

1. `G5-1`（基线冻结）: `S01~S03` 完成，且对标状态非 Pending。
2. `G5-2`（命令统一）: `S04~S06` 完成，本地/CI 同命令同结果。
3. `G5-3`（治理可控）: `S07~S12` 完成，flaky < 2%，安全门可阻断。
4. `G5-4`（发布可回退）: `S13~S15` 完成，至少一次演练通过。
5. `G5-5`（阶段收口）: `S16~S17` 完成，Phase 5 closure 判定为 `PASS` 或 `PASS_WITH_WAIVER`。

## 7. 风险与回滚策略

1. 门禁过严影响吞吐时：仅允许短期降级到 warning，并强制附风险单与过期时间。
2. CI 稳定性不足时：先保留 quick gate 阻断，release gate 可临时手工触发但必须留痕。
3. 扫描工具误报过高时：建立 baseline，禁止直接关闭扫描步骤。
4. 发布演练失败时：冻结正式发布，直到 runbook 修复并复演通过。

## 8. 建议执行顺序（两周节奏示例）

1. Week 1: `S01~S06`（完成对标冻结 + 质量门统一）
2. Week 2A: `S07~S12`（测试治理 + 安全治理）
3. Week 2B: `S13~S17`（发布演练 + 收口回写）

## 9. Plan Mutation Protocol

1. 新增切片必须挂到已有 WIP，不允许游离任务。
2. 任一切片延期超过 2 天，必须重算关键路径并更新文档日期。
3. 若 `G5-2` 前发现契约不合理，只允许回到 `S03` 重冻，不允许直接跳改脚本。
4. 若 `G5-4` 连续失败 2 次，自动触发 Phase 5 风险复盘，不得推进 `S16`。
