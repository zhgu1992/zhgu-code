# Observability 模块说明

`src/observability` 是一套轻量级追踪链路，目标是回答一个问题：
当某次对话卡住、超时或失败时，能不能快速定位问题发生在 `turn / provider / tool / permission` 的哪一段。

## 模块组成

- `trace-model.ts`：统一事件模型（`TraceEvent`、stage/status/metrics）。
- `ids.ts`：`session/trace/turn/span` ID 生成。
- `trace-bus.ts`：进程内异步事件总线（带有界队列）。
- `sinks.ts`：输出端（`JsonlTraceSink`、`ConsoleTraceSink`）。
- `sanitize.ts`：敏感信息脱敏、字符串截断、深度限制。
- `bootstrap.ts`：模块初始化（挂载 sink、发 session.start）。
- `replay.ts`：读取 trace 文件并触发校验。
- `assertions.ts`：链路完整性断言（turn/tool/provider/orphan parent）。
- `index.ts`：统一导出。

## 事件流转图（核心）

```text
业务代码 emit()
    |
    v
TraceBus.emit(envelope)
    |
    |-- sanitize(payload)
    |-- enqueue (bounded queue)
    v
microtask drain()
    |
    +--> JsonlTraceSink  -> .trace/trace.jsonl
    |
    +--> ConsoleTraceSink -> stderr (可开关)
    |
    v
replay.ts loadTraceEvents()
    |
    v
assertions.ts validateTraceEvents()
```

## 启动与运行流程

1. 启动时调用 `initializeObservability(store)`。
2. `TraceBus` 注册 sink（JSONL + Console）。
3. 业务侧在关键节点发事件：`bus.emit({...})`。
4. 事件先脱敏，再入队，再异步写出。
5. 运行后可用 `replay + assertions` 做回放校验。

## 为什么要有队列

`trace-bus.ts` 用有界队列（`ZHGU_TRACE_QUEUE_MAX`，默认 `2000`）避免观测系统反压主流程。

高峰期丢弃策略：

- 当前事件是低优先级：直接丢当前事件。
- 当前事件不是低优先级：优先踢掉队列里的低优先级事件。
- 队列里没有低优先级：踢掉最旧事件。

已丢数量会写入后续事件的 `metrics.dropped_events`。

## 关键环境变量

- `ZHGU_TRACE_FILE`：trace JSONL 输出路径（默认 `.trace/trace.jsonl`）。
- `ZHGU_TRACE_CONSOLE`：设为 `0` 可关闭控制台 trace 输出。
- `ZHGU_TRACE_QUEUE_MAX`：内存队列上限。

## 接入示例

```ts
import { getTraceBus, createSpanId } from './observability/index.js'

const bus = getTraceBus()
bus.emit({
  stage: 'tool',
  event: 'call_start',
  status: 'start',
  session_id: sessionId,
  trace_id: traceId,
  turn_id: turnId,
  span_id: createSpanId(),
  payload: { tool: 'Bash', command: 'ls -la' },
})
```

## 回放校验示例

```ts
import { validateTraceFile } from './observability/replay.js'

const report = await validateTraceFile('.trace/trace.jsonl')
if (!report.pass) {
  console.error(report.failures)
}
```

## 使用约束

- 观测逻辑不能影响主流程，sink 报错会被吞掉（设计如此）。
- payload 已脱敏，但仍不建议主动写入原始密钥。
- 事件命名应保持稳定，断言与后续可视化依赖事件名。
