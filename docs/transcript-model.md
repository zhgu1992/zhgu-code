# Transcript Model (WP1-E)

本文定义 Phase 1 `WP1-E` 的最小 transcript 语义边界，用于“会话可核对事实”持久化与主链路复原。

## 1. 目标

- 以 session 级 JSONL 落盘最小事件集。
- 记录消息追加事实：`user/assistant/tool_use/tool_result`。
- 支持 reader 聚合出 turn 主链路：`input -> tool_use/tool_result -> output`。

## 2. 事件模型（V1）

每行一个 JSON 对象，append-only，不允许原地改写历史。

### 2.1 `session_start`

字段：

- `ts` `string` ISO 时间戳
- `type` 固定为 `session_start`
- `session_id` `string`
- `trace_id` `string`
- `model` `string`
- `cwd` `string`

### 2.2 `message_append`

字段：

- `ts` `string` ISO 时间戳
- `type` 固定为 `message_append`
- `session_id` `string`
- `trace_id` `string`
- `turn_id` `string`（可选；无 turn 归属时可缺失）
- `message_id` `string`
- `role` `user | assistant | system`
- `content` 与消息内容同构（字符串或 content block 数组）
- `is_tool_result` `boolean`

约束：

- transcript 不记录流式 chunk，只记录最终 `addMessage` 结果。
- `tool_use` 与 `tool_result` 关联依赖原有字段：
  - `tool_use.id`
  - `tool_result.tool_use_id`

### 2.3 `session_end`（可选）

字段：

- `ts` `string` ISO 时间戳
- `type` 固定为 `session_end`
- `session_id` `string`
- `trace_id` `string`
- `reason` `string`（可选）
- `duration_ms` `number`（可选）

## 3. 写入语义

- 单入口：挂在 `state.addMessage(...)`，避免 query/tool 分支重复写入。
- 写入方式：best-effort 异步写盘，失败不阻塞主流程。
- 失败可见性：
  - stderr 输出错误
  - trace 追加 `state.transcript_write_error`

## 4. 回放语义

reader 最小能力：

1. 读取 JSONL 并校验事件合法性。
2. 按 `turn_id` 聚合 `message_append`。
3. 识别每个 turn 的：
   - 输入：`role=user && !is_tool_result`
   - 中间工具链：`assistant(tool_use)` + `user(tool_result)` 关联
   - 输出：`role=assistant && !is_tool_result`
4. 对不完整链路返回 `partial=true` 并标记缺口（如 `missing_tool_result:<id>`）。

## 5. 与 Trace 的边界

- trace：回答“执行发生了什么”。
- transcript：回答“会话可核对事实是什么”。
- transcript 不复制 trace 的 span/priority/status 诊断字段，只保留对齐键：`session_id/trace_id/turn_id`。
