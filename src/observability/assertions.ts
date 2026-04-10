import type { TraceEvent } from './trace-model.js'

export interface TraceAssertionReport {
  pass: boolean
  failures: string[]
}

interface TurnTransitionPayload {
  from: string
  to: string
  event: string
  reason?: string
}

export function validateTraceEvents(events: TraceEvent[]): TraceAssertionReport {
  const failures: string[] = []

  // Core replay invariants. If any of them fail, traces are incomplete
  // or inconsistent for debugging/forensics.
  assertTurnLifecycle(events, failures)
  assertToolLifecycle(events, failures)
  assertProviderFirstEvent(events, failures)
  assertNoOrphanParent(events, failures)
  assertTurnTransitionSemantics(events, failures)

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

function assertTurnTransitionSemantics(events: TraceEvent[], failures: string[]): void {
  const transitionEvents = events.filter(
    (event) => event.stage === 'state' && event.event === 'turn_transition',
  )

  if (transitionEvents.length === 0) {
    return
  }

  // If the trace bus reported dropped events, strict ordering assertions may
  // produce false positives. Skip strict checks in degraded traces.
  if (hasDroppedEvents(events)) {
    return
  }

  const transitionsByTurn = new Map<string, TurnTransitionPayload[]>()

  for (const event of transitionEvents) {
    if (!event.turn_id) {
      failures.push('state.turn_transition missing turn_id')
      continue
    }

    const payload = parseTurnTransitionPayload(event.payload)
    if (!payload) {
      failures.push(`state.turn_transition invalid payload turn_id=${event.turn_id}`)
      continue
    }

    assertTransitionRule(event.turn_id, payload, failures)

    const list = transitionsByTurn.get(event.turn_id) || []
    list.push(payload)
    transitionsByTurn.set(event.turn_id, list)
  }

  for (const [turnId, transitions] of transitionsByTurn.entries()) {
    if (transitions.length === 0) {
      continue
    }

    for (let i = 1; i < transitions.length; i += 1) {
      const prev = transitions[i - 1]
      const current = transitions[i]
      if (!prev || !current) {
        continue
      }
      if (prev.to !== current.from) {
        failures.push(
          `turn_transition chain mismatch turn_id=${turnId} at=${i} prev.to=${prev.to} current.from=${current.from}`,
        )
      }
      if (prev.to === 'stopped') {
        failures.push(`turn_transition terminal state continued turn_id=${turnId} at=${i}`)
      }
    }
  }

  const turnStarts = events.filter((event) => event.stage === 'turn' && event.event === 'start')
  for (const start of turnStarts) {
    if (!start.turn_id) {
      continue
    }
    const transitions = transitionsByTurn.get(start.turn_id) || []
    const first = transitions[0]
    if (!first) {
      failures.push(`turn.start missing turn_transition turn_id=${start.turn_id}`)
      continue
    }
    if (first.event !== 'turn_start' || first.from !== 'idle' || first.to !== 'streaming') {
      failures.push(`turn.start not anchored to idle->streaming turn_start turn_id=${start.turn_id}`)
    }
  }

  const turnEndings = events.filter(
    (event) => event.stage === 'turn' && (event.event === 'end' || event.event === 'error'),
  )

  for (const ending of turnEndings) {
    if (!ending.turn_id) {
      continue
    }
    const transitions = transitionsByTurn.get(ending.turn_id) || []
    const finalStopTransition = [...transitions].reverse().find((transition) => transition.to === 'stopped')

    if (!finalStopTransition) {
      failures.push(`turn.${ending.event} missing stopped transition turn_id=${ending.turn_id}`)
      continue
    }

    if (ending.event === 'end' && finalStopTransition.reason !== 'completed') {
      failures.push(
        `turn.end must align with stopped(completed) turn_id=${ending.turn_id} reason=${finalStopTransition.reason || 'unknown'}`,
      )
    }

    if (ending.event === 'error' && finalStopTransition.reason === 'completed') {
      failures.push(`turn.error must not align with stopped(completed) turn_id=${ending.turn_id}`)
    }
  }
}

function assertTransitionRule(
  turnId: string,
  payload: TurnTransitionPayload,
  failures: string[],
): void {
  const { from, to, event, reason } = payload

  switch (event) {
    case 'turn_start':
      if (!(from === 'idle' && to === 'streaming')) {
        failures.push(`turn_transition invalid turn_start turn_id=${turnId} from=${from} to=${to}`)
      }
      return
    case 'tool_use_detected':
      if (!(from === 'streaming' && (to === 'awaiting-permission' || to === 'tool-running'))) {
        failures.push(`turn_transition invalid tool_use_detected turn_id=${turnId} from=${from} to=${to}`)
      }
      return
    case 'permission_approved':
      if (!(from === 'awaiting-permission' && to === 'tool-running')) {
        failures.push(
          `turn_transition invalid permission_approved turn_id=${turnId} from=${from} to=${to}`,
        )
      }
      return
    case 'permission_denied':
      if (!(from === 'awaiting-permission' && to === 'stopped' && reason === 'permission_denied')) {
        failures.push(`turn_transition invalid permission_denied turn_id=${turnId} from=${from} to=${to} reason=${reason || 'unknown'}`)
      }
      return
    case 'tool_result_written':
      if (!(from === 'tool-running' && to === 'streaming')) {
        failures.push(`turn_transition invalid tool_result_written turn_id=${turnId} from=${from} to=${to}`)
      }
      return
    case 'assistant_done':
      if (!(from === 'streaming' && to === 'stopped' && reason === 'completed')) {
        failures.push(`turn_transition invalid assistant_done turn_id=${turnId} from=${from} to=${to} reason=${reason || 'unknown'}`)
      }
      return
    case 'recoverable_error':
      if (!((from === 'streaming' || from === 'tool-running') && to === 'recovering')) {
        failures.push(`turn_transition invalid recoverable_error turn_id=${turnId} from=${from} to=${to}`)
      }
      return
    case 'recovery_succeeded':
      if (!(from === 'recovering' && to === 'streaming')) {
        failures.push(`turn_transition invalid recovery_succeeded turn_id=${turnId} from=${from} to=${to}`)
      }
      return
    case 'recovery_failed':
      if (!(from === 'recovering' && to === 'stopped' && reason === 'recovery_failed')) {
        failures.push(`turn_transition invalid recovery_failed turn_id=${turnId} from=${from} to=${to} reason=${reason || 'unknown'}`)
      }
      return
    case 'retry_exhausted':
      if (!(from === 'recovering' && to === 'stopped' && reason === 'recovery_failed')) {
        failures.push(`turn_transition invalid retry_exhausted turn_id=${turnId} from=${from} to=${to} reason=${reason || 'unknown'}`)
      }
      return
    case 'user_cancelled':
      if (!(from !== 'stopped' && to === 'stopped' && reason === 'cancelled')) {
        failures.push(`turn_transition invalid user_cancelled turn_id=${turnId} from=${from} to=${to} reason=${reason || 'unknown'}`)
      }
      return
    case 'budget_exceeded':
      if (!(from !== 'stopped' && to === 'stopped' && reason === 'budget_exceeded')) {
        failures.push(`turn_transition invalid budget_exceeded turn_id=${turnId} from=${from} to=${to} reason=${reason || 'unknown'}`)
      }
      return
    case 'fatal_error':
      if (!(from !== 'stopped' && to === 'stopped' && reason === 'fatal_error')) {
        failures.push(`turn_transition invalid fatal_error turn_id=${turnId} from=${from} to=${to} reason=${reason || 'unknown'}`)
      }
      return
    default:
      failures.push(`turn_transition unknown event turn_id=${turnId} event=${event}`)
  }
}

function parseTurnTransitionPayload(payload: unknown): TurnTransitionPayload | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }
  const record = payload as Record<string, unknown>
  if (
    typeof record.from !== 'string' ||
    typeof record.to !== 'string' ||
    typeof record.event !== 'string'
  ) {
    return null
  }

  if (record.reason !== undefined && typeof record.reason !== 'string') {
    return null
  }

  return {
    from: record.from,
    to: record.to,
    event: record.event,
    reason: record.reason as string | undefined,
  }
}

function hasDroppedEvents(events: TraceEvent[]): boolean {
  return events.some((event) => (event.metrics?.dropped_events || 0) > 0)
}
