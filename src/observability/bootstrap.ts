import { resolve } from 'node:path'
import type { AppStore } from '../state/store.js'
import { createSpanId } from './ids.js'
import { ConsoleTraceSink, JsonlTraceSink } from './sinks.js'
import { getTraceBus } from './trace-bus.js'

let initialized = false

export function initializeObservability(store: AppStore): string {
  const bus = getTraceBus()
  const state = store.getState()

  const traceFilePath = resolve(
    process.cwd(),
    process.env.ZHGU_TRACE_FILE || '.trace/trace.jsonl',
  )

  if (!initialized) {
    bus.addSink(new JsonlTraceSink(traceFilePath))
    bus.addSink(new ConsoleTraceSink(process.env.ZHGU_TRACE_CONSOLE !== '0'))
    initialized = true
  }

  bus.emit({
    stage: 'session',
    event: 'start',
    status: 'start',
    session_id: state.sessionId,
    trace_id: state.traceId,
    span_id: createSpanId(),
    payload: {
      cwd: state.cwd,
      model: state.model,
      permissionMode: state.permissionMode,
    },
  })

  return traceFilePath
}
