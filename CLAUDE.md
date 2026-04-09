# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是一个基于 React/Ink 的终端 AI 编程助手 CLI，通过调用 Anthropic Claude API 实现交互式编程辅助。 
任何能力优先参考 /Users/zhgu/Documents/claude-code-run/src 下的源码实现

## 架构演进规则（必须遵守）

当进行 `design.md` 中的架构演进（尤其是 Phase 级别任务）时，必须执行“原版核心模块对标机制”：

1. 先分析原版 `claude-code-run/src` 对应模块（入口文件、能力边界、状态/事件模型、失败恢复）。
2. 再在 `rewrite` 实现当前阶段目标（明确 In Scope / Out of Scope，不盲目追平原版全部复杂度）。
3. 完成后必须回对标，输出差距结论：
   - 已对齐项
   - 部分对齐项
   - 明确缺口与下一阶段补齐计划

对标输出维度固定为：
- 能力覆盖
- 稳定性
- 调试可见性
- 安全边界
- 复杂度成本

每个“大模块”都要有一份对标记录；观测/追踪体系是首个样例，细节见 `design.md` 的“13/14”章节。

## 常用命令

```bash
# 安装依赖
bun install

# 开发模式运行
bun run dev

# 构建
bun build

# 测试
bun test

# 单个测试文件
bun test src/__tests__/phase2.test.ts

# Lint 检查
bun run lint

# Lint 自动修复
bun run lint:fix

# 格式化
bun run format
```

## 架构

### 核心流程

1. **`src/entrypoint.ts`** → 入口文件，初始化 CLI
2. **`src/cli/index.ts`** → Commander.js CLI 定义，解析参数后调用 `startREPL`
3. **`src/core/repl.ts`** → REPL 初始化，创建 Zustand store，构建 context
4. **`src/core/query.ts`** → 核心查询函数，调用 API 流式接口，处理事件（thinking/text/tool_use/done）
5. **`src/tools/executor.ts`** → 工具执行器，根据权限模式决定是否执行工具
6. **`src/ui/App.tsx`** → 主 UI 组件，渲染消息列表、输入框、进度指示器

### 状态管理

- **`src/state/store.ts`** → Zustand store，包含：
  - `messages` - 对话消息列表
  - `isStreaming` / `streamingText` / `thinking` - 流式状态
  - `toolProgress` - 工具执行进度（用于长时间任务显示）
  - `pendingTool` - 待批准的 tool 调用

### 工具系统

- **`src/tools/registry.ts`** → 工具注册表（单例模式）
- **`src/tools/<name>.ts`** → 各工具实现：
  - `BashTool` / `ReadTool` / `WriteTool` / `EditTool` / `GlobTool` / `GrepTool`（P0 核心工具）
  - `WebFetchTool` / `WebSearchTool` / `AskUserTool`（P1 工具）

### API 层

- **`src/api/client.ts`** → Anthropic API 客户端，流式接口实现

### UI 层（Ink）

- **`src/ui/App.tsx`** → 根组件
- **`src/ui/Spinner.tsx`** → 加载动画，支持工具执行进度和 API 调用状态
- **`src/ui/PermissionPrompt.tsx`** → 工具权限确认
- **`src/ui/ErrorDisplay.tsx`** → 错误显示
- **`src/ui/TokenUsage.tsx`** → Token 统计

### 进度显示逻辑

`Spinner` 组件根据状态显示不同内容：
- 工具执行中：显示工具名称 + 耗时
- API 调用中：旋转动画 + 随机动词 + 耗时 + Token 数量
- 长时间无活动：颜色从 cyan → yellow → red 渐变（stall 检测）

## 类型定义

- **`src/definitions/types/`** → 核心类型定义（`Message`、`ContentBlock`、`Tool`、`PermissionMode` 等）
- **`src/definitions/constants/`** → 常量定义（应用常量、退出码、UI Spinner 常量）

## 技术栈

- **运行时**: Bun
- **CLI**: Commander.js
- **UI**: Ink（React for terminal）+ Zustand
- **API**: @anthropic-ai/sdk
