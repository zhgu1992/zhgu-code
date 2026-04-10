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

## 6. 数据来源与组装逻辑

### 6.1 数据来源（不是由 `.trace/trace.jsonl` 组装）

- `transcript` 与 `trace` 都默认写在 [.trace/](../../.trace) 目录下，但属于两条独立流水线：
  - trace 文件：`.trace/trace.jsonl`
  - transcript 文件：`.trace/transcript.jsonl`
- transcript 的事实来源是 `state.addMessage(...)` 写入时机，不是离线从 trace 回推。
- trace 仅用于诊断事件；transcript 仅用于会话事实回放。

### 6.2 写入流程（运行时）

1. Store 初始化时创建 `JsonlTranscriptWriter`，并写入 `session_start`。
2. 每次执行 `addMessage`：
   - 先写入内存消息（`messages`）。
   - 然后异步追加一条 `message_append` 到 transcript。
3. 追加事件字段包含：
   - `session_id / trace_id / turn_id / message_id / role / content / is_tool_result`。
4. 写盘失败不会阻塞主流程：
   - stderr 输出错误
   - trace 增加 `state.transcript_write_error` 事件

### 6.3 回放流程（`transcript:replay`）

1. 读取 transcript JSONL（`readTranscriptFile`）。
2. 逐行 JSON 解析并按 schema 校验（`parseTranscriptJsonl` + `parseTranscriptEvent`）。
3. 若带 `--latest`，先筛选最新 `session_id` 对应的事件子集。
4. 组装两种视图：
   - 用户轮次视图（默认）：按用户输入切分会话轮次，展示 `user_input / tool_calls / assistant_output`。
   - engine turn 视图（`--engine-turns`）：按 `turn_id` 聚合 `input/tool_chain/output`，用于底层调试。
5. 若带 `--turn <id>`，会在当前事件集上按 turn 过滤（支持完整 id 或后缀匹配）。

### 6.4 为什么会出现 `missing_input/missing_output`

- 在 engine turn 视图里，某些 turn 只承载工具链路（`tool_use/tool_result`），用户输入可能是无 `turn_id` 事件。
- 这会导致该 turn 被标记 `partial`，但不代表 transcript 丢数据。
- 可用默认视图或 `--show-unscoped` 查看完整上下文。

## 7. CLI 使用

### 7.1 直接查看 transcript（实时）

```bash
bun run transcript:tail
```

可选传路径（默认读取 `.trace/transcript.jsonl`）：

```bash
bun run transcript:tail -- .trace/transcript.jsonl
```

也支持环境变量覆盖：

```bash
ZHGU_TRANSCRIPT_FILE=/abs/path/transcript.jsonl bun run transcript:tail
```

### 7.2 回放 transcript（聚合 turn 主链路）

```bash
bun run transcript:replay
```

默认输出为“用户轮次视图”，每轮都展示：

- `user_input`：用户输入内容
- `tool_calls`：工具名、参数、结果摘要
- `assistant_output`：助手最终可见输出

常用参数：

- `--turn <turn_id>`：只看指定 turn
- `--latest`：仅回放最新一次 session
- `--json`：输出机器可读 JSON
- `--file <path>`：把输出写入文件（适合 `--json` 结果归档）
- `--show-unscoped`：显示无 `turn_id` 的消息
- `--engine-turns`：切回底层 engine turn 视图（调试用）
- `--full`：显示完整内容，不做摘要截断
- `--readable`：`--json` 下输出可读链路（减少 ID 字段，突出输入/工具参数与结果/输出）

示例：

```bash
bun run transcript:replay -- --json
bun run transcript:replay -- --json --file /tmp/transcript.json
bun run transcript:replay -- --latest
bun run transcript:replay -- --latest --full --file /tmp/transcript-latest.txt
bun run transcript:replay -- --turn turn_abc123
bun run transcript:replay -- --show-unscoped
bun run transcript:replay -- --engine-turns
bun run transcript:replay -- --full
bun run transcript:replay -- --latest --json --readable
```

### 7.3 `--json` 核心字段速查

顶层字段（排障最常看）：

- `path`：本次回放读取的 transcript 文件路径
- `event_count`：本次参与回放的事件数（过滤后）
- `source_event_count`：源文件总事件数（过滤前）
- `latest_only`：是否启用 `--latest`
- `session_id`：`--latest` 命中会话 ID（未命中时可能为 `null`）
- `issue_count` / `issues`：JSONL 解析或 schema 校验问题
- `conversation_count`：用户轮次视图条数
- `engine_turn_count`：engine turn 视图条数
- `unscoped_count`：无 `turn_id` 的消息条数

`conversations[]`（用户视图）：

- `index`：第几轮用户会话
- `user_inputs[]`：用户输入摘要
- `tool_calls[]`：工具调用摘要
- `assistant_outputs[]`：助手可见输出摘要
- `has_user_input`：该轮是否存在用户输入
- `orphan_tool_results[]`：找不到对应 `tool_use` 的工具结果
- `turn_ids[]`：仅非 `--readable` 时包含，表示该轮关联的 engine turn 集合

`conversations[].tool_calls[]`：

- `name`：工具名
- `input`：工具参数摘要
- `result`：工具结果摘要
- `result_found`：是否匹配到 `tool_result`
- `tool_use_id` / `turn_id`：仅非 `--readable` 时包含

`engine_turns[]`（引擎视图）：

- `index`：按时间顺序的 turn 序号（1-based）
- `input[]`：该 turn 内捕获到的用户输入消息（可能为空）
- `tool_chain[]`：该 turn 的工具链
- `output[]`：该 turn 的助手输出消息（可能为空）
- `partial`：是否不完整（`gaps` 非空）
- `gaps[]`：缺口原因，如 `missing_input` / `missing_output` / `missing_tool_result:<id>`

`engine_turns[].tool_chain[]`：

- `name` / `input` / `result` / `result_found`：`--readable` 可读字段
- `toolUseId` / `toolUseMessageId` / `toolResultMessageId`：非 `--readable` 原始关联字段

