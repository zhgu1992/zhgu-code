# Roadmap 导航

本目录用于按 Phase 管理开发计划与进度，支持“一阶段一目录”推进。

## 总览

1. 总路线图（全局基线）: `docs/roadmap/master-roadmap.md`
2. Phase 0: `docs/roadmap/phase-0/README.md`
3. Phase 0.1: `docs/roadmap/phase-0-1/README.md`
4. Phase 1: `docs/roadmap/phase-1/README.md`
5. Phase 2: `docs/roadmap/phase-2/README.md`
6. Phase 3: `docs/roadmap/phase-3/README.md`
7. Phase 4: `docs/roadmap/phase-4/README.md`
8. Phase 5: `docs/roadmap/phase-5/README.md`

## 状态规范

- `Status`: `Not Started` | `In Progress` | `Blocked` | `Done`
- `Updated`: `YYYY-MM-DD`
- 每个 Phase 文档需包含：目标、范围、任务、验收标准、风险与阻塞

## 大 Phase 对标规范（必须）

每个大 Phase 开发前必须先完成“源码对标结论”，并写入对应 `phase-*/README.md`。

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
