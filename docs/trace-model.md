# Trace Model (Phase 0.1)

## 目标
- 提供最小可回放链路：`REPL 输入 -> query -> provider stream -> tool -> 输出`
- 事件结构统一，支持自动断言与故障定位
- 不阻塞主链路（异步总线 + 队列丢弃低优先级）

## 事件结构

```ts
interface TraceEvent {
  ts: string
  session_id: string
  trace_id: string
  turn_id?: string
  span_id: string
  parent_span_id?: string
  stage: 'session' | 'ui' | 'turn' | 'query' | 'provider' | 'tool' | 'permission' | 'state'
  event: string
  status: 'start' | 'ok' | 'error' | 'timeout' | 'info'
  priority?: 'high' | 'normal' | 'low'
  metrics?: {
    duration_ms?: number
    dropped_events?: number
    input_tokens?: number
    output_tokens?: number
    payload_bytes?: number
  }
  payload?: unknown
}
```

## 关键事件
- `turn.start` / `turn.end|turn.error`
- `state.turn_transition`（`payload: { from, to, event, reason? }`）
- `provider.stream_start` / `provider.first_event|provider.connect_timeout` / `provider.stream_end|provider.stream_error`
- `tool.call_start` / `tool.call_end|tool.call_error`
- `permission.prompt` / `permission.allow|permission.deny`

## 脱敏与截断
- 字段名命中 `token|key|secret|password|authorization|header` 时写入 `[REDACTED]`
- 长字符串截断，尾部附 `sha256` 摘要

## 队列策略
- 队列上限由 `ZHGU_TRACE_QUEUE_MAX` 控制（默认 `2000`）
- 队列满时优先丢弃 `low` 优先级事件，确保主链路不被 trace 阻塞

## Sidecar 观测
- 默认落盘：`./.trace/trace.jsonl`（可用 `ZHGU_TRACE_FILE` 覆盖）
- 侧窗查看：`./scripts/trace-tail.sh`

## 断言规则
- 每个 `turn.start` 必有 `turn.end|turn.error`
- 每个 `tool.call_start` 必有 `tool.call_end|tool.call_error`
- 每个 `provider.stream_start` 必有 `provider.first_event|provider.connect_timeout`
- 禁止 orphan span（`parent_span_id` 指向不存在的 `span_id`）
- `state.turn_transition` 必须是合法迁移，且同一 `turn_id` 形成连续链（`prev.to === next.from`）
- `turn.start` 必须锚定到首个迁移：`idle -> streaming (turn_start)`
- `turn.end|turn.error` 必须锚定到终态迁移：`to=stopped`

当 trace 中出现 `metrics.dropped_events > 0` 时，迁移链严格断言会降级跳过，避免队列丢事件导致误报。

## 示例：工具调用回放

```json
{"stage":"turn","event":"start","status":"start","turn_id":"turn_x"}
{"stage":"provider","event":"stream_start","status":"start","turn_id":"turn_x"}
{"stage":"provider","event":"first_event","status":"ok","turn_id":"turn_x"}
{"stage":"tool","event":"call_start","status":"start","turn_id":"turn_x","payload":{"toolName":"Read"}}
{"stage":"tool","event":"call_end","status":"ok","turn_id":"turn_x","payload":{"toolName":"Read"}}
{"stage":"turn","event":"end","status":"ok","turn_id":"turn_x"}
```

## 示例：连接超时回放

```json
{"stage":"turn","event":"start","status":"start","turn_id":"turn_y"}
{"stage":"provider","event":"stream_start","status":"start","turn_id":"turn_y"}
{"stage":"provider","event":"connect_timeout","status":"timeout","turn_id":"turn_y"}
{"stage":"provider","event":"stream_error","status":"error","turn_id":"turn_y"}
{"stage":"turn","event":"error","status":"error","turn_id":"turn_y"}
```
