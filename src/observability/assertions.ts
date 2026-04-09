import type { TraceEvent } from './trace-model.js'

export interface TraceAssertionReport {
  pass: boolean
  failures: string[]
}

export function validateTraceEvents(events: TraceEvent[]): TraceAssertionReport {
  const failures: string[] = []

  assertTurnLifecycle(events, failures)
  assertToolLifecycle(events, failures)
  assertProviderFirstEvent(events, failures)
  assertNoOrphanParent(events, failures)

  return {
    pass: failures.length === 0,
    failures,
  }
}

function assertTurnLifecycle(events: TraceEvent[], failures: string[]): void {
  const starts = events.filter((event) => event.stage === 'turn' && event.event === 'start')
  const endings = new Set(
    events
      .filter(
        (event) => event.stage === 'turn' && (event.event === 'end' || event.event === 'error'),
      )
      .map((event) => event.turn_id)
      .filter(Boolean) as string[],
  )

  for (const start of starts) {
    if (!start.turn_id) {
      failures.push(`turn.start missing turn_id span=${start.span_id}`)
      continue
    }
    if (!endings.has(start.turn_id)) {
      failures.push(`turn.start missing end/error turn_id=${start.turn_id}`)
    }
  }
}

function assertToolLifecycle(events: TraceEvent[], failures: string[]): void {
  const starts = events.filter((event) => event.stage === 'tool' && event.event === 'call_start')
  const endings = new Set(
    events
      .filter(
        (event) =>
          event.stage === 'tool' &&
          (event.event === 'call_end' || event.event === 'call_error'),
      )
      .map((event) => event.span_id),
  )

  for (const start of starts) {
    if (!endings.has(start.span_id)) {
      failures.push(`tool.call.start missing end/error span_id=${start.span_id}`)
    }
  }
}

function assertProviderFirstEvent(events: TraceEvent[], failures: string[]): void {
  const starts = events.filter(
    (event) => event.stage === 'provider' && event.event === 'stream_start',
  )
  const okSpans = new Set(
    events
      .filter(
        (event) =>
          event.stage === 'provider' &&
          (event.event === 'first_event' || event.event === 'connect_timeout'),
      )
      .map((event) => event.span_id),
  )

  for (const start of starts) {
    if (!okSpans.has(start.span_id)) {
      failures.push(`provider.stream.start missing first_event/connect_timeout span_id=${start.span_id}`)
    }
  }
}

function assertNoOrphanParent(events: TraceEvent[], failures: string[]): void {
  const allSpans = new Set(events.map((event) => event.span_id))

  for (const event of events) {
    if (event.parent_span_id && !allSpans.has(event.parent_span_id)) {
      failures.push(`orphan parent span parent_span_id=${event.parent_span_id} child_span_id=${event.span_id}`)
    }
  }
}
