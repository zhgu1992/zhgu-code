export type TraceStage =
  | 'session'
  | 'ui'
  | 'turn'
  | 'query'
  | 'provider'
  | 'tool'
  | 'permission'
  | 'state'

export type TraceStatus = 'start' | 'ok' | 'error' | 'timeout' | 'info'

export type TracePriority = 'high' | 'normal' | 'low'

export interface TraceMetrics {
  duration_ms?: number
  queue_size?: number
  dropped_events?: number
  input_tokens?: number
  output_tokens?: number
  payload_bytes?: number
}

export interface TraceEvent {
  ts: string
  session_id: string
  trace_id: string
  turn_id?: string
  span_id: string
  parent_span_id?: string
  stage: TraceStage
  event: string
  status: TraceStatus
  priority?: TracePriority
  metrics?: TraceMetrics
  payload?: unknown
}

export interface TraceEnvelope {
  stage: TraceStage
  event: string
  status: TraceStatus
  session_id: string
  trace_id: string
  span_id: string
  turn_id?: string
  parent_span_id?: string
  priority?: TracePriority
  metrics?: TraceMetrics
  payload?: unknown
}

export interface TraceSink {
  write: (event: TraceEvent) => Promise<void> | void
}
