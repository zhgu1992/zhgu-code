import { describe, expect, test } from 'bun:test'
import { classifyQueryError } from '../application/query/errors.js'
import {
  createRecoveryEventPayload,
  decideRecovery,
  getDefaultMaxTotalRecoveryAttempts,
} from '../application/query/recovery.js'
import { validateTraceEvents } from '../observability/assertions.js'
import type { TraceEvent } from '../observability/trace-model.js'

function event(partial: Partial<TraceEvent>): TraceEvent {
  return {
    ts: '2026-04-10T00:00:00.000Z',
    session_id: 'sess_rhd',
    trace_id: 'trace_rhd',
    span_id: 'span_default',
    stage: 'state',
    event: 'noop',
    status: 'info',
    ...partial,
  }
}

describe('Phase 1 / WP1-H Recovery hardening', () => {
  test('RHD-001 subclass detection: provider timeout -> network_transient.timeout', () => {
    const classified = classifyQueryError('Stream idle timeout after 45000ms', 'provider')

    expect(classified.errorClass).toBe('network_transient')
    expect(classified.errorSubclass).toBe('timeout')
  })

  test('RHD-002 subclass fallback: unknown error stays conservative', () => {
    const classified = classifyQueryError('unexpected schema mismatch in provider output', 'provider')

    expect(classified.errorClass).toBe('non_recoverable')
    expect(classified.errorSubclass).toBe('unknown_subclass')
    expect(classified.retryable).toBe(false)
  })

  test('RHD-003 provider layered retry: transient error retries within budget', () => {
    const decision = decideRecovery({
      errorClass: 'network_transient',
      errorSubclass: 'timeout',
      source: 'provider',
      attempt: 0,
      totalAttempt: 0,
      maxTotalAttempts: getDefaultMaxTotalRecoveryAttempts(),
      safeToRetry: true,
    })

    expect(decision.action).toBe('retry')
    expect(decision.event).toBe('recoverable_error')
    expect(decision.maxAttempts).toBe(2)
    expect(decision.backoffMs).toBeGreaterThan(0)
  })

  test('RHD-004 provider retry exhausted: stop with retry_exhausted', () => {
    const decision = decideRecovery({
      errorClass: 'network_transient',
      errorSubclass: 'timeout',
      source: 'provider',
      attempt: 2,
      totalAttempt: 2,
      maxTotalAttempts: getDefaultMaxTotalRecoveryAttempts(),
      safeToRetry: true,
    })

    expect(decision.action).toBe('stop')
    expect(decision.event).toBe('retry_exhausted')
  })

  test('RHD-005 tool idempotent retry: safe_to_retry=true allows retry', () => {
    const decision = decideRecovery({
      errorClass: 'tool_transient',
      errorSubclass: 'tool_io',
      source: 'tool',
      attempt: 0,
      totalAttempt: 0,
      maxTotalAttempts: getDefaultMaxTotalRecoveryAttempts(),
      safeToRetry: true,
    })

    expect(decision.action).toBe('retry')
    expect(decision.event).toBe('recoverable_error')
    expect(decision.blockedByIdempotency).toBe(false)
  })

  test('RHD-006 tool idempotency guard: safe_to_retry=false blocks auto retry', () => {
    const decision = decideRecovery({
      errorClass: 'tool_transient',
      errorSubclass: 'tool_io',
      source: 'tool',
      attempt: 0,
      totalAttempt: 0,
      maxTotalAttempts: getDefaultMaxTotalRecoveryAttempts(),
      safeToRetry: false,
    })

    expect(decision.action).toBe('stop')
    expect(decision.event).toBe('retry_exhausted')
    expect(decision.blockedByIdempotency).toBe(true)
  })

  test('RHD-007 global recovery cap: provider+tool combined attempts are bounded', () => {
    const maxTotal = getDefaultMaxTotalRecoveryAttempts()
    const decision = decideRecovery({
      errorClass: 'provider_rate_limited',
      errorSubclass: 'rate_limit',
      source: 'provider',
      attempt: 0,
      totalAttempt: maxTotal,
      maxTotalAttempts: maxTotal,
      safeToRetry: true,
    })

    expect(decision.action).toBe('stop')
    expect(decision.event).toBe('retry_exhausted')
  })

  test('RHD-008 recovery events are replay-diagnosable with required fields', () => {
    const recoveryPayload = createRecoveryEventPayload({
      source: 'provider',
      errorClass: 'network_transient',
      errorSubclass: 'timeout',
      action: 'retry',
      attempt: 0,
      maxAttempts: 2,
      backoffMs: 350,
      blockedByIdempotency: false,
    })

    const events: TraceEvent[] = [
      event({ stage: 'turn', event: 'start', status: 'start', turn_id: 'turn_rhd_8', span_id: 'span_turn_8' }),
      event({
        stage: 'state',
        event: 'turn_transition',
        status: 'ok',
        turn_id: 'turn_rhd_8',
        span_id: 'span_state_8_1',
        payload: { from: 'idle', to: 'streaming', event: 'turn_start' },
      }),
      event({
        stage: 'query',
        event: 'recovery_started',
        status: 'ok',
        turn_id: 'turn_rhd_8',
        span_id: 'span_query_8_1',
        payload: recoveryPayload,
      }),
      event({
        stage: 'query',
        event: 'retry_scheduled',
        status: 'ok',
        turn_id: 'turn_rhd_8',
        span_id: 'span_query_8_2',
        payload: recoveryPayload,
      }),
      event({
        stage: 'query',
        event: 'retry_succeeded',
        status: 'ok',
        turn_id: 'turn_rhd_8',
        span_id: 'span_query_8_3',
        payload: { ...recoveryPayload, attempt: 1 },
      }),
      event({
        stage: 'state',
        event: 'turn_transition',
        status: 'ok',
        turn_id: 'turn_rhd_8',
        span_id: 'span_state_8_2',
        payload: { from: 'streaming', to: 'stopped', event: 'assistant_done', reason: 'completed' },
      }),
      event({ stage: 'turn', event: 'end', status: 'ok', turn_id: 'turn_rhd_8', span_id: 'span_turn_8' }),
    ]

    const report = validateTraceEvents(events)
    expect(report.pass).toBe(true)
  })

  test('RHD-009 state machine alignment: recovering -> streaming|stopped remains valid', () => {
    const successEvents: TraceEvent[] = [
      event({ stage: 'turn', event: 'start', status: 'start', turn_id: 'turn_rhd_9a', span_id: 'span_turn_9a' }),
      event({
        stage: 'state',
        event: 'turn_transition',
        status: 'ok',
        turn_id: 'turn_rhd_9a',
        span_id: 'span_state_9a_1',
        payload: { from: 'idle', to: 'streaming', event: 'turn_start' },
      }),
      event({
        stage: 'state',
        event: 'turn_transition',
        status: 'error',
        turn_id: 'turn_rhd_9a',
        span_id: 'span_state_9a_2',
        payload: { from: 'streaming', to: 'recovering', event: 'recoverable_error' },
      }),
      event({
        stage: 'state',
        event: 'turn_transition',
        status: 'ok',
        turn_id: 'turn_rhd_9a',
        span_id: 'span_state_9a_3',
        payload: { from: 'recovering', to: 'streaming', event: 'recovery_succeeded' },
      }),
      event({
        stage: 'state',
        event: 'turn_transition',
        status: 'ok',
        turn_id: 'turn_rhd_9a',
        span_id: 'span_state_9a_4',
        payload: { from: 'streaming', to: 'stopped', event: 'assistant_done', reason: 'completed' },
      }),
      event({ stage: 'turn', event: 'end', status: 'ok', turn_id: 'turn_rhd_9a', span_id: 'span_turn_9a' }),
    ]

    const failedEvents: TraceEvent[] = [
      event({ stage: 'turn', event: 'start', status: 'start', turn_id: 'turn_rhd_9b', span_id: 'span_turn_9b' }),
      event({
        stage: 'state',
        event: 'turn_transition',
        status: 'ok',
        turn_id: 'turn_rhd_9b',
        span_id: 'span_state_9b_1',
        payload: { from: 'idle', to: 'streaming', event: 'turn_start' },
      }),
      event({
        stage: 'state',
        event: 'turn_transition',
        status: 'error',
        turn_id: 'turn_rhd_9b',
        span_id: 'span_state_9b_2',
        payload: { from: 'streaming', to: 'recovering', event: 'recoverable_error' },
      }),
      event({
        stage: 'state',
        event: 'turn_transition',
        status: 'error',
        turn_id: 'turn_rhd_9b',
        span_id: 'span_state_9b_3',
        payload: { from: 'recovering', to: 'stopped', event: 'retry_exhausted', reason: 'recovery_failed' },
      }),
      event({ stage: 'turn', event: 'error', status: 'error', turn_id: 'turn_rhd_9b', span_id: 'span_turn_9b' }),
    ]

    expect(validateTraceEvents(successEvents).pass).toBe(true)
    expect(validateTraceEvents(failedEvents).pass).toBe(true)
  })

  test('RHD-010 legacy recovery matrix compatibility is preserved', () => {
    const providerRetry = decideRecovery('network_transient', 0)
    const providerExhausted = decideRecovery('network_transient', 2)
    const toolRetry = decideRecovery('tool_transient', 0)
    const toolExhausted = decideRecovery('tool_transient', 1)

    expect(providerRetry.action).toBe('retry')
    expect(providerExhausted.event).toBe('retry_exhausted')
    expect(toolRetry.action).toBe('retry')
    expect(toolExhausted.event).toBe('retry_exhausted')
  })
})
