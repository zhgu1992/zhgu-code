import { describe, expect, test } from 'bun:test'
import { classifyQueryError, classifyToolResult } from '../application/query/errors.js'
import { decideRecovery } from '../application/query/recovery.js'

describe('Phase 1 / WP1-D Recovery matrix', () => {
  test('DREC-001 permission denied is classified as stop', () => {
    const classified = classifyQueryError('Tool Bash was denied by user', 'tool')
    const decision = decideRecovery(classified.errorClass, 0)

    expect(classified.errorClass).toBe('permission_denied')
    expect(decision.action).toBe('stop')
    expect(decision.event).toBe('permission_denied')
  })

  test('DREC-002 budget exceeded is classified as stop', () => {
    const classified = classifyQueryError('Budget exceeded: output tokens limit=10, actual=20.', 'budget')
    const decision = decideRecovery(classified.errorClass, 0)

    expect(classified.errorClass).toBe('budget_exceeded')
    expect(decision.action).toBe('stop')
    expect(decision.event).toBe('budget_exceeded')
  })

  test('DREC-003 network transient retries within budget', () => {
    const classified = classifyQueryError(
      new Error('Stream idle timeout after 45000ms'),
      'provider',
    )
    const decision = decideRecovery(classified.errorClass, 0)

    expect(classified.errorClass).toBe('network_transient')
    expect(decision.action).toBe('retry')
    expect(decision.event).toBe('recoverable_error')
    expect(decision.maxAttempts).toBe(2)
  })

  test('DREC-004 network transient exhausts to retry_exhausted', () => {
    const decision = decideRecovery('network_transient', 2)
    expect(decision.action).toBe('stop')
    expect(decision.event).toBe('retry_exhausted')
  })

  test('DREC-005 provider rate limit uses retry path', () => {
    const classified = classifyQueryError('429 Too Many Requests: rate limit exceeded', 'provider')
    const decision = decideRecovery(classified.errorClass, 0)

    expect(classified.errorClass).toBe('provider_rate_limited')
    expect(decision.action).toBe('retry')
    expect(decision.maxAttempts).toBe(2)
  })

  test('DREC-006 tool transient allows single retry then stops', () => {
    const classified = classifyToolResult('Error: temporary network failure on tool call')
    expect(classified).not.toBeNull()
    if (!classified) {
      throw new Error('Expected transient tool classification')
    }

    const firstDecision = decideRecovery(classified.errorClass, 0)
    const exhaustedDecision = decideRecovery(classified.errorClass, 1)

    expect(classified.errorClass).toBe('tool_transient')
    expect(firstDecision.action).toBe('retry')
    expect(firstDecision.maxAttempts).toBe(1)
    expect(exhaustedDecision.action).toBe('stop')
    expect(exhaustedDecision.event).toBe('retry_exhausted')
  })

  test('DREC-007 non recoverable goes fatal', () => {
    const classified = classifyQueryError('invalid request payload schema mismatch', 'provider')
    const decision = decideRecovery(classified.errorClass, 0)

    expect(classified.errorClass).toBe('non_recoverable')
    expect(decision.action).toBe('fatal')
    expect(decision.event).toBe('fatal_error')
  })

  test('DREC-008 classification includes source and action context', () => {
    const classified = classifyQueryError('Stream connection timeout after 20000ms', 'provider')
    const decision = decideRecovery(classified.errorClass, 0)

    expect(classified.source).toBe('provider')
    expect(classified.errorClass).toBe('network_transient')
    expect(decision.action).toBe('retry')
  })
})
