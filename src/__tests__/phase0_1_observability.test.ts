import { describe, expect, test } from 'bun:test'
import { validateTraceEvents } from '../observability/assertions.js'
import type { TraceEvent } from '../observability/trace-model.js'

function event(partial: Partial<TraceEvent>): TraceEvent {
  return {
    ts: '2026-04-09T00:00:00.000Z',
    session_id: 'sess_test',
    trace_id: 'trace_test',
    span_id: 'span_default',
    stage: 'state',
    event: 'noop',
    status: 'info',
    ...partial,
  }
}

describe('Phase 0.1 Observability Assertions', () => {
  test('passes tool call replay', () => {
    const events: TraceEvent[] = [
      event({ stage: 'turn', event: 'start', status: 'start', turn_id: 'turn_1', span_id: 'span_turn_1' }),
      event({ stage: 'provider', event: 'stream_start', status: 'start', turn_id: 'turn_1', span_id: 'span_provider_1', parent_span_id: 'span_turn_1' }),
      event({ stage: 'provider', event: 'first_event', status: 'ok', turn_id: 'turn_1', span_id: 'span_provider_1', parent_span_id: 'span_turn_1' }),
      event({ stage: 'tool', event: 'call_start', status: 'start', turn_id: 'turn_1', span_id: 'span_tool_1', parent_span_id: 'span_turn_1' }),
      event({ stage: 'tool', event: 'call_end', status: 'ok', turn_id: 'turn_1', span_id: 'span_tool_1', parent_span_id: 'span_turn_1' }),
      event({ stage: 'turn', event: 'end', status: 'ok', turn_id: 'turn_1', span_id: 'span_turn_1' }),
    ]

    const report = validateTraceEvents(events)
    expect(report.pass).toBe(true)
    expect(report.failures).toEqual([])
  })

  test('passes connect timeout replay', () => {
    const events: TraceEvent[] = [
      event({ stage: 'turn', event: 'start', status: 'start', turn_id: 'turn_2', span_id: 'span_turn_2' }),
      event({ stage: 'provider', event: 'stream_start', status: 'start', turn_id: 'turn_2', span_id: 'span_provider_2', parent_span_id: 'span_turn_2' }),
      event({ stage: 'provider', event: 'connect_timeout', status: 'timeout', turn_id: 'turn_2', span_id: 'span_provider_2', parent_span_id: 'span_turn_2' }),
      event({ stage: 'turn', event: 'error', status: 'error', turn_id: 'turn_2', span_id: 'span_turn_2' }),
    ]

    const report = validateTraceEvents(events)
    expect(report.pass).toBe(true)
    expect(report.failures).toEqual([])
  })

  test('fails when provider first event is missing', () => {
    const events: TraceEvent[] = [
      event({ stage: 'turn', event: 'start', status: 'start', turn_id: 'turn_3', span_id: 'span_turn_3' }),
      event({ stage: 'provider', event: 'stream_start', status: 'start', turn_id: 'turn_3', span_id: 'span_provider_3', parent_span_id: 'span_turn_3' }),
      event({ stage: 'turn', event: 'end', status: 'ok', turn_id: 'turn_3', span_id: 'span_turn_3' }),
    ]

    const report = validateTraceEvents(events)
    expect(report.pass).toBe(false)
    expect(report.failures[0]).toContain('provider.stream.start')
  })
})
