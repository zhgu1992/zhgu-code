import { describe, expect, test } from 'bun:test'
import { validateTraceEvents } from '../observability/assertions.js'
import type { TraceEvent } from '../observability/trace-model.js'

function event(partial: Partial<TraceEvent>): TraceEvent {
  return {
    ts: '2026-04-10T00:00:00.000Z',
    session_id: 'sess_ftr',
    trace_id: 'trace_ftr',
    span_id: 'span_default',
    stage: 'state',
    event: 'noop',
    status: 'info',
    ...partial,
  }
}

describe('Phase 1 / WP1-F Trace transition assertions', () => {
  test('FTR-001 valid transition chain passes', () => {
    const events: TraceEvent[] = [
      event({ stage: 'turn', event: 'start', status: 'start', turn_id: 'turn_ftr_1', span_id: 'span_turn_1' }),
      event({
        stage: 'state',
        event: 'turn_transition',
        status: 'ok',
        turn_id: 'turn_ftr_1',
        span_id: 'span_state_1',
        payload: { from: 'idle', to: 'streaming', event: 'turn_start' },
      }),
      event({
        stage: 'state',
        event: 'turn_transition',
        status: 'ok',
        turn_id: 'turn_ftr_1',
        span_id: 'span_state_2',
        payload: { from: 'streaming', to: 'tool-running', event: 'tool_use_detected' },
      }),
      event({
        stage: 'state',
        event: 'turn_transition',
        status: 'ok',
        turn_id: 'turn_ftr_1',
        span_id: 'span_state_3',
        payload: { from: 'tool-running', to: 'streaming', event: 'tool_result_written' },
      }),
      event({
        stage: 'state',
        event: 'turn_transition',
        status: 'ok',
        turn_id: 'turn_ftr_1',
        span_id: 'span_state_4',
        payload: { from: 'streaming', to: 'stopped', event: 'assistant_done', reason: 'completed' },
      }),
      event({ stage: 'turn', event: 'end', status: 'ok', turn_id: 'turn_ftr_1', span_id: 'span_turn_1' }),
    ]

    const report = validateTraceEvents(events)
    expect(report.pass).toBe(true)
    expect(report.failures).toEqual([])
  })

  test('FTR-002 missing start anchor fails', () => {
    const events: TraceEvent[] = [
      event({ stage: 'turn', event: 'start', status: 'start', turn_id: 'turn_ftr_2', span_id: 'span_turn_2' }),
      event({
        stage: 'state',
        event: 'turn_transition',
        status: 'ok',
        turn_id: 'turn_ftr_2',
        span_id: 'span_state_5',
        payload: { from: 'streaming', to: 'stopped', event: 'assistant_done', reason: 'completed' },
      }),
      event({ stage: 'turn', event: 'end', status: 'ok', turn_id: 'turn_ftr_2', span_id: 'span_turn_2' }),
    ]

    const report = validateTraceEvents(events)
    expect(report.pass).toBe(false)
    expect(report.failures.some((failure) => failure.includes('turn.start not anchored'))).toBe(true)
  })

  test('FTR-003 chain mismatch fails', () => {
    const events: TraceEvent[] = [
      event({ stage: 'turn', event: 'start', status: 'start', turn_id: 'turn_ftr_3', span_id: 'span_turn_3' }),
      event({
        stage: 'state',
        event: 'turn_transition',
        status: 'ok',
        turn_id: 'turn_ftr_3',
        span_id: 'span_state_6',
        payload: { from: 'idle', to: 'streaming', event: 'turn_start' },
      }),
      event({
        stage: 'state',
        event: 'turn_transition',
        status: 'ok',
        turn_id: 'turn_ftr_3',
        span_id: 'span_state_7',
        payload: { from: 'tool-running', to: 'streaming', event: 'tool_result_written' },
      }),
      event({
        stage: 'state',
        event: 'turn_transition',
        status: 'ok',
        turn_id: 'turn_ftr_3',
        span_id: 'span_state_8',
        payload: { from: 'streaming', to: 'stopped', event: 'assistant_done', reason: 'completed' },
      }),
      event({ stage: 'turn', event: 'end', status: 'ok', turn_id: 'turn_ftr_3', span_id: 'span_turn_3' }),
    ]

    const report = validateTraceEvents(events)
    expect(report.pass).toBe(false)
    expect(report.failures.some((failure) => failure.includes('chain mismatch'))).toBe(true)
  })

  test('FTR-004 turn end/error alignment enforced', () => {
    const events: TraceEvent[] = [
      event({ stage: 'turn', event: 'start', status: 'start', turn_id: 'turn_ftr_4', span_id: 'span_turn_4' }),
      event({
        stage: 'state',
        event: 'turn_transition',
        status: 'ok',
        turn_id: 'turn_ftr_4',
        span_id: 'span_state_9',
        payload: { from: 'idle', to: 'streaming', event: 'turn_start' },
      }),
      event({
        stage: 'state',
        event: 'turn_transition',
        status: 'error',
        turn_id: 'turn_ftr_4',
        span_id: 'span_state_10',
        payload: { from: 'streaming', to: 'stopped', event: 'fatal_error', reason: 'fatal_error' },
      }),
      event({ stage: 'turn', event: 'end', status: 'ok', turn_id: 'turn_ftr_4', span_id: 'span_turn_4' }),
    ]

    const report = validateTraceEvents(events)
    expect(report.pass).toBe(false)
    expect(report.failures.some((failure) => failure.includes('turn.end must align'))).toBe(true)
  })

  test('FTR-005 degraded traces with dropped events skip strict transition checks', () => {
    const events: TraceEvent[] = [
      event({
        stage: 'turn',
        event: 'start',
        status: 'start',
        turn_id: 'turn_ftr_5',
        span_id: 'span_turn_5',
        metrics: { dropped_events: 1 },
      }),
      event({
        stage: 'state',
        event: 'turn_transition',
        status: 'ok',
        turn_id: 'turn_ftr_5',
        span_id: 'span_state_11',
        payload: { from: 'streaming', to: 'stopped', event: 'assistant_done', reason: 'completed' },
      }),
      event({ stage: 'turn', event: 'end', status: 'ok', turn_id: 'turn_ftr_5', span_id: 'span_turn_5' }),
    ]

    const report = validateTraceEvents(events)
    expect(report.pass).toBe(true)
    expect(report.failures).toEqual([])
  })
})
