import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { buildContextSignalEvents } from '../application/query/context-events.js'
import type { ContextHealthSnapshot } from '../application/query/context-health.js'
import { validateTraceEvents } from '../observability/assertions.js'
import { getTraceBus } from '../observability/trace-bus.js'
import type { TraceEvent, TraceSink } from '../observability/trace-model.js'

function createSnapshot(input: {
  source: ContextHealthSnapshot['source']
  status: ContextHealthSnapshot['status']
  usage: { context: number; input: number; output: number }
  limits: { maxContext: number; maxInput: number; maxOutput: number }
  estimated?: { context: boolean; input: boolean; output: boolean }
}): ContextHealthSnapshot {
  return {
    source: input.source,
    status: input.status,
    usage: input.usage,
    limits: input.limits,
    estimated: input.estimated ?? {
      context: true,
      input: true,
      output: true,
    },
  }
}

function traceEvent(partial: Partial<TraceEvent>): TraceEvent {
  return {
    ts: '2026-04-10T00:00:00.000Z',
    session_id: 'sess_ctxm',
    trace_id: 'trace_ctxm',
    span_id: 'span_default',
    stage: 'state',
    event: 'noop',
    status: 'info',
    ...partial,
  }
}

describe('Phase 2.5 / WP2.5-B Context warning and blocking events', () => {
  beforeEach(() => {
    getTraceBus().clearSinks()
  })

  afterEach(() => {
    getTraceBus().clearSinks()
  })

  test('CTXM-005 emits context.warning with context_near_limit on ok -> warning transition', () => {
    const dedupe = new Set<string>()
    const warningSnapshot = createSnapshot({
      source: 'streaming',
      status: 'warning',
      usage: { context: 80, input: 0, output: 0 },
      limits: { maxContext: 100, maxInput: 200, maxOutput: 200 },
    })

    const first = buildContextSignalEvents({
      turnId: 'turn_ctxm_005',
      previousStatus: 'ok',
      snapshot: warningSnapshot,
      dedupeKeys: dedupe,
      timestamp: '2026-04-10T10:00:00.000Z',
    })
    const second = buildContextSignalEvents({
      turnId: 'turn_ctxm_005',
      previousStatus: 'ok',
      snapshot: warningSnapshot,
      dedupeKeys: dedupe,
      timestamp: '2026-04-10T10:00:01.000Z',
    })

    expect(first).toHaveLength(1)
    expect(first[0]).toMatchObject({
      eventType: 'context.warning',
      reasonCode: 'context_near_limit',
      metric: 'context_tokens',
      source: 'streaming',
    })
    expect(second).toEqual([])
  })

  test('CTXM-006 emits context.blocking with context_limit_exceeded when over limit', () => {
    const blockingSnapshot = createSnapshot({
      source: 'done',
      status: 'blocking',
      usage: { context: 60, input: 30, output: 51 },
      limits: { maxContext: 100, maxInput: 100, maxOutput: 50 },
      estimated: { context: true, input: false, output: false },
    })

    const events = buildContextSignalEvents({
      turnId: 'turn_ctxm_006',
      previousStatus: 'warning',
      snapshot: blockingSnapshot,
      timestamp: '2026-04-10T10:10:00.000Z',
    })

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      eventType: 'context.blocking',
      reasonCode: 'context_limit_exceeded',
      metric: 'output_tokens',
      actual: 51,
      limit: 50,
      source: 'done',
      estimated: false,
    })
  })

  test('CTXM-007 context signal payload is trace-assertable with required fields', () => {
    const [warningEvent] = buildContextSignalEvents({
      turnId: 'turn_ctxm_007',
      previousStatus: 'ok',
      snapshot: createSnapshot({
        source: 'streaming',
        status: 'warning',
        usage: { context: 80, input: 0, output: 0 },
        limits: { maxContext: 100, maxInput: 200, maxOutput: 200 },
      }),
      timestamp: '2026-04-10T10:20:00.000Z',
    })

    const events: TraceEvent[] = [
      traceEvent({
        stage: 'turn',
        event: 'start',
        status: 'start',
        turn_id: 'turn_ctxm_007',
        span_id: 'span_turn_007',
      }),
      traceEvent({
        stage: 'state',
        event: 'turn_transition',
        status: 'ok',
        turn_id: 'turn_ctxm_007',
        span_id: 'span_state_007_1',
        payload: { from: 'idle', to: 'streaming', event: 'turn_start' },
      }),
      traceEvent({
        stage: 'query',
        event: warningEvent.eventType,
        status: 'info',
        turn_id: 'turn_ctxm_007',
        span_id: 'span_query_007',
        payload: {
          reasonCode: warningEvent.reasonCode,
          metric: warningEvent.metric,
          actual: warningEvent.actual,
          limit: warningEvent.limit,
          ratio: warningEvent.ratio,
          source: warningEvent.source,
          estimated: warningEvent.estimated,
          turnId: warningEvent.turnId,
          timestamp: warningEvent.timestamp,
        },
      }),
      traceEvent({
        stage: 'state',
        event: 'turn_transition',
        status: 'ok',
        turn_id: 'turn_ctxm_007',
        span_id: 'span_state_007_2',
        payload: { from: 'streaming', to: 'stopped', event: 'assistant_done', reason: 'completed' },
      }),
      traceEvent({
        stage: 'turn',
        event: 'end',
        status: 'ok',
        turn_id: 'turn_ctxm_007',
        span_id: 'span_turn_007',
      }),
    ]

    const report = validateTraceEvents(events)
    expect(report.pass).toBe(true)
    expect(report.failures).toEqual([])
  })

  test('CTXM-008 sink write failure degrades to observability-only and does not throw', async () => {
    const seen: TraceEvent[] = []
    const throwingSink: TraceSink = {
      async write() {
        throw new Error('sink unavailable')
      },
    }
    const recordingSink: TraceSink = {
      write(event) {
        seen.push(event)
      },
    }

    const bus = getTraceBus()
    bus.addSink(throwingSink)
    bus.addSink(recordingSink)

    expect(() => {
      bus.emit({
        stage: 'query',
        event: 'context.warning',
        status: 'info',
        session_id: 'sess_ctxm_008',
        trace_id: 'trace_ctxm_008',
        turn_id: 'turn_ctxm_008',
        span_id: 'span_ctxm_008',
        payload: {
          reasonCode: 'context_near_limit',
          metric: 'context_tokens',
          actual: 80,
          limit: 100,
          ratio: 0.8,
          source: 'streaming',
          estimated: true,
          turnId: 'turn_ctxm_008',
          timestamp: '2026-04-10T10:30:00.000Z',
        },
      })
    }).not.toThrow()

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(seen.some((event) => event.stage === 'query' && event.event === 'context.warning')).toBe(
      true,
    )
  })
})
