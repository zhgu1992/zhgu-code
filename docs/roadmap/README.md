# Roadmap 导航

本目录用于按 Phase 管理开发计划与进度，支持“一阶段一目录”推进。

## 总览

1. 总路线图（全局基线）: [docs/roadmap/master-roadmap.md](./master-roadmap.md)
2. Phase 0: [docs/roadmap/phase-0/README.md](./phase-0/README.md)
3. Phase 0.1: [docs/roadmap/phase-0-1/README.md](./phase-0-1/README.md)
4. Phase 1: [docs/roadmap/phase-1/README.md](./phase-1/README.md)
5. Phase 2: [docs/roadmap/phase-2/README.md](./phase-2/README.md)
6. Phase 3: [docs/roadmap/phase-3/README.md](./phase-3/README.md)
7. Phase 4: [docs/roadmap/phase-4/README.md](./phase-4/README.md)
8. Phase 5: [docs/roadmap/phase-5/README.md](./phase-5/README.md)

## 状态规范

- `Status`: `Not Started` | `In Progress` | `Blocked` | `Done`
- `Updated`: `YYYY-MM-DD`
- 每个 Phase 文档需包含：目标、范围、任务、验收标准、风险与阻塞

## 大 Phase 对标规范（必须）

每个大 Phase 开发前必须先完成“源码对标结论”，并写入对应 [phase-*/README.md](./)。

固定顺序：

1. `claude-code-run/src` 源码事实（主依据）
2. `rewrite/src` 当前实现（现状）
3. `rewrite/knowledge/**`（背景补充）

固定输出字段：

1. 对标范围（本 Phase 涉及模块）
2. 已对齐项
3. 差异项：能力覆盖、稳定性、可观测性、安全边界、复杂度
4. In Scope / Out of Scope
5. 参考证据（至少列出关键源码路径）

## WIP 讨论门禁协议（必须）

触发条件（任一满足即触发）：

1. 你要求“执行某个小步骤”
2. 你说“我们来讨论 wipxxx”
3. 进入任意 `WPx-*` 的实现前

执行规则：

1. 若下列任一项未讨论，必须先讨论，不进入代码实现。
2. 讨论结论需记录到对应 [phase-*/README.md](./) 的 WIP 记录表。
3. 未通过门禁的 WIP 状态只能是 `Pending`，不得标记 `In Progress`。

必问清单（最小集合）：

1. 为什么做 + 问题与边界：为什么现在做、本 WIP 解决什么、不解决什么（In/Out）。
2. 超越目标：相比对标源码，本 WIP 至少 1 个“做得更好”的目标。
3. 核心设计：核心能力/状态/迁移/接口决策（按模块类型裁剪）。
4. 验证方案：可执行 case 与 DoD（通过即完成，不通过即未完成）。
5. 风险回滚：主要风险与失败后的回退方案。

建议记录模板：

| WIP | 为什么做 + 问题与边界 | 超越目标 | 核心设计 | 验证Case/DoD | 风险回滚 | 结论 |
|---|---|---|---|---|---|---|
| `wip-xxx` | TBD | TBD | TBD | TBD | TBD | Pending |
