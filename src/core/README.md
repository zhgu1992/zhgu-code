# Core 模块说明

`src/core` 是 CLI 的核心运行层，负责把“用户输入”变成“模型调用 + 工具调用 + 最终回复”。

## 文件职责

1. `repl.ts`
- 入口协调层。
- 创建 store（会话状态）、初始化 observability、加载上下文。
- 决定运行模式：
- 交互模式：渲染 Ink UI（`App`）。
- 单次模式（`--prompt`/pipe）：直接触发一次 `query()`。

2. `query.ts`
- 核心回合引擎（turn loop）。
- 主要职责：
- 组装请求（messages + system prompt + tools schema）。
- 调用 `api/client.stream()` 消费流式事件（thinking/text/tool_use/done）。
- 在遇到工具调用时执行 `executeTool()`，把 `tool_use` 和 `tool_result` 追加到消息历史，再递归进入下一轮。
- 更新 UI 相关状态（streamingText/thinking/error/token usage）。
- 输出 trace 事件（turn/query/provider 生命周期）。
- 关键辅助函数：
- `appendTextDelta()`：把连续文本 delta 合并到同一个 text block，减少碎片。

3. `context.ts`
- 构建系统上下文 `Context`。
- 数据来源：
- 运行时系统信息（平台、Node 版本、时间）。
- Git 信息（分支、`git status --short`）。
- `CLAUDE.md`（用户级 + 项目级 + 父目录）。
- memory 目录下的 markdown（用户长期偏好/记忆）。

4. `prompt.ts`
- 把 `Context` 转成系统提示词字符串。
- 负责把系统信息、Git、memory、CLAUDE.md 合并为最终 prompt。

## 运行链路（简化）

```text
CLI -> startREPL()
    -> buildContext()
    -> (interactive) render(App)
       or (single) query()

query()
  -> buildSystemPrompt(context)
  -> stream(model, messages, tools)
  -> 处理事件:
     text/thinking -> 更新状态
     tool_use      -> executeTool -> 写入 tool_result -> 递归 query()
     done          -> 写入 assistant 消息并结束回合
```

## 回合时序图（Turn Sequence）

```text
User/CLI
  |
  | submit prompt
  v
core/repl.ts
  |
  | query(store)
  v
core/query.ts
  |-- emit turn.start
  |-- emit query.execute_start
  |-- emit provider.stream_start
  |
  |<-- stream event: first_event
  |-- emit provider.first_event
  |
  |<-- stream event: thinking/text (0..n)
  |-- update state.thinking / state.streamingText
  |
  |<-- stream event: tool_use_start + tool_input_complete
  |-- executeTool(name, input)
  |-- add assistant(tool_use)
  |-- add user(tool_result)
  |-- set handoffToNextTurn=true
  |-- recurse query(store) ------------------------------+
  |                                                     |
  +-----------------------------------------------------+
  |
  |<-- stream event: done (无工具时进入)
  |-- append final assistant message
  |-- update token usage
  |
  |-- emit query.execute_end
  |-- emit turn.end / turn.error
  |-- stopStreaming + clear currentTurnId
  v
return
```

工具调用分支要点：

1. 当前回合在拿到 `tool_result` 后，会把控制权交给下一次递归 `query()`。
2. 因为有 `handoffToNextTurn`，当前回合 `finally` 不会提前清空 streaming 状态。
3. 最终由“最后一个不再触发工具”的回合统一收尾（`turn.end`）。

## 与其他模块边界

- 输入依赖：
- `api/`：模型流式接口
- `tools/`：工具注册与执行
- `state/`：会话状态存储
- `definitions/types/`：类型定义
- `observability/`：trace 追踪

- 输出职责：
- 向 `state` 写入 UI 可消费状态（消息、流式文本、错误、token）。
- 向 `observability` 写入可回放事件。

## 排障建议

1. 无回复或卡住：先看 `query.ts` 的 provider 事件（`stream_start/first_event/stream_error`）。
2. 工具调用异常：看 `tool_use` 后是否写入了 `tool_result`，以及 `executeTool()` 返回值。
3. 提示词不符合预期：看 `context.ts` 数据是否正确，再看 `prompt.ts` 拼接顺序。
4. UI 显示异常：看 `state` 中 `streamingText/thinking/messages` 是否按事件更新。
