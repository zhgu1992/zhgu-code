# zhgu-code rewrite

一个面向复杂工程任务的 AI Coding CLI 重写项目。  
目标不是“做一个能跑的终端助手”，而是做一个可持续进化、可观测、可治理的工程级 Agent 平台。

## 项目定位

`rewrite` 当前处于“核心骨架已打通，平台平面持续建设”阶段：

1. 已有：CLI + REPL + Query 循环 + 工具执行 + 基础权限 + 基础观测
2. 在建：Query Engine v2（状态机、预算、恢复、transcript）
3. 后续：执行治理平面、集成平面（MCP/Plugin/Skill）、编排平面（Plan/Task/Agent）

## 核心能力（当前）

1. 流式多轮对话与工具调用闭环
2. 基础工具系统（Bash/Read/Write/Edit/Glob/Grep/Web 等）
3. 权限模式（`ask` / `auto`）
4. 观测链路（trace JSONL + replay/assertions）
5. 模块化目录（`core / application / platform / observability`）

## 架构与文档

1. 文档导航: `docs/README.md`
2. 架构事实: `docs/architecture/system-design.md`
3. 路线图总览: `docs/roadmap/master-roadmap.md`
4. 分 Phase 执行: `docs/roadmap/README.md`
5. 关键决策: `docs/adr/`

## 开发命令

```bash
bun install
bun run dev
bun run build
bunx tsc --noEmit
bun run lint
bun test
```

## 开发流程（建议）

1. 先看 `docs/roadmap/phase-x/README.md` 确认阶段目标
2. 涉及架构变更先更新 ADR
3. 实现后同步更新对应 Phase 进度
4. 通过 build/type/lint/test 后再推进下一阶段

## 项目愿景

我们要做的是“最牛”的 coding agent CLI：  
不仅能回答和写代码，还能在复杂项目中长期稳定协作，具备清晰边界、执行治理和可追踪性。
