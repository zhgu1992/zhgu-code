# Phase 3 - Integration Plane：`integration graph` 使用说明

本文档说明如何用 `bun` 命令查看 Integration Graph，并验证默认 Claude skill 是否已接入。

## 1. 先在 `rewrite/` 目录执行

```bash
cd rewrite
```

## 2. 先跑一轮 query（生成最新 trace 快照）

```bash
bun run dev -- "hello"
```

如果不先跑这一步，`integration graph` 可能返回：
- `type: "no_data"`
- `reason: "integration_graph_unavailable"`

## 3. 查看 Integration Graph

```bash
bun run dev -- integration graph
```

输出是 JSON 快照，核心字段：
- `nodes`: 所有能力节点（builtin/mcp/plugin/skill）
- `edges`: 归属关系（如 mcp tool -> provider）
- `summary`: 汇总统计（total/callable/disabled/conflicts/sourceCounts）
- `conflictGroups`: 同名工具冲突归并结果

## 4. 如何看“默认 skill 是否加载成功”

默认会扫描两个目录：
- `<cwd>/.claude/skills`
- `~/.claude/skills`

在图快照里，关注 `nodes` 中：
- `source: "skill"`
- `loadedFrom: "skills"`

如果存在这类节点，说明默认 Claude skill 目录已被加载并进入统一注册面。

## 5. 覆盖默认 skill 目录（可选）

可以通过环境变量指定目录（逗号分隔）：

```bash
ZHGU_INTEGRATION_SKILL_DIRS=/abs/skillsA,/abs/skillsB bun run dev -- "hello"
bun run dev -- integration graph
```

当设置该变量时，会优先使用这个列表，而不是默认目录。
