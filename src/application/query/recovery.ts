import type { QueryTurnEvent } from '../../architecture/contracts/query-engine.js'
import type { QueryErrorClass, QueryErrorSubclass } from './errors.js'

export type RecoveryAction = 'retry' | 'stop' | 'fatal'

export interface RecoveryDecision {
  action: RecoveryAction
  event: QueryTurnEvent
  maxAttempts: number
  backoffMs: number
  maxTotalAttempts: number
  blockedByIdempotency: boolean
}

interface RecoveryPolicy {
  maxAttempts: number
  backoffMs: number
  exhaustedEvent: QueryTurnEvent
}

export interface RecoveryDecisionInput {
  errorClass: QueryErrorClass
  errorSubclass?: QueryErrorSubclass
  source: 'provider' | 'tool'
  attempt: number
  totalAttempt: number
  maxTotalAttempts?: number
  safeToRetry?: boolean
}

const RECOVERY_POLICIES: Record<QueryErrorClass, RecoveryPolicy | null> = {
  permission_denied: null,
  budget_exceeded: null,
  non_recoverable: null,
  network_transient: {
    maxAttempts: 2,
    backoffMs: 350,
    exhaustedEvent: 'retry_exhausted',
  },
  provider_rate_limited: {
    maxAttempts: 2,
    backoffMs: 800,
    exhaustedEvent: 'retry_exhausted',
  },
  tool_transient: {
    maxAttempts: 1,
    backoffMs: 250,
    exhaustedEvent: 'retry_exhausted',
  },
}

const DEFAULT_MAX_TOTAL_ATTEMPTS = 3

function stopDecision(
  event: QueryTurnEvent,
  maxAttempts = 0,
  backoffMs = 0,
  maxTotalAttempts = DEFAULT_MAX_TOTAL_ATTEMPTS,
  blockedByIdempotency = false,
): RecoveryDecision {
  return {
    action: 'stop',
    event,
    maxAttempts,
    backoffMs,
    maxTotalAttempts,
    blockedByIdempotency,
  }
}

export function decideRecovery(errorClass: QueryErrorClass, attempt: number): RecoveryDecision
export function decideRecovery(input: RecoveryDecisionInput): RecoveryDecision
export function decideRecovery(
  arg1: QueryErrorClass | RecoveryDecisionInput,
  arg2?: number,
): RecoveryDecision {
  const input: RecoveryDecisionInput =
    typeof arg1 === 'string'
      ? {
          errorClass: arg1,
          source: arg1 === 'tool_transient' ? 'tool' : 'provider',
          attempt: arg2 ?? 0,
          totalAttempt: arg2 ?? 0,
          safeToRetry: true,
        }
      : arg1
  const maxTotalAttempts = input.maxTotalAttempts ?? DEFAULT_MAX_TOTAL_ATTEMPTS

  if (input.errorClass === 'permission_denied') {
    return stopDecision('permission_denied', 0, 0, maxTotalAttempts)
  }

  if (input.errorClass === 'budget_exceeded') {
    return stopDecision('budget_exceeded', 0, 0, maxTotalAttempts)
  }

  if (input.errorClass === 'non_recoverable') {
    return {
      action: 'fatal',
      event: 'fatal_error',
      maxAttempts: 0,
      backoffMs: 0,
      maxTotalAttempts,
      blockedByIdempotency: false,
    }
  }

  if (input.totalAttempt >= maxTotalAttempts) {
    return stopDecision('retry_exhausted', 0, 0, maxTotalAttempts)
  }

  if (input.source === 'tool' && input.safeToRetry !== true) {
    return stopDecision('retry_exhausted', 0, 0, maxTotalAttempts, true)
  }

  const policy = RECOVERY_POLICIES[input.errorClass]
  if (!policy) {
    return {
      action: 'fatal',
      event: 'fatal_error',
      maxAttempts: 0,
      backoffMs: 0,
      maxTotalAttempts,
      blockedByIdempotency: false,
    }
  }

  if (input.attempt < policy.maxAttempts) {
    return {
      action: 'retry',
      event: 'recoverable_error',
      maxAttempts: policy.maxAttempts,
      backoffMs: policy.backoffMs,
      maxTotalAttempts,
      blockedByIdempotency: false,
    }
  }

  return stopDecision(
    policy.exhaustedEvent,
    policy.maxAttempts,
    policy.backoffMs,
    maxTotalAttempts,
  )
}

export function getDefaultMaxTotalRecoveryAttempts(): number {
  return DEFAULT_MAX_TOTAL_ATTEMPTS
}

export function createRecoveryEventPayload(input: {
  source: 'provider' | 'tool'
  errorClass: QueryErrorClass
  errorSubclass: QueryErrorSubclass
  action: RecoveryAction
  attempt: number
  maxAttempts: number
  backoffMs: number
  blockedByIdempotency: boolean
}): Record<string, unknown> {
  return {
    source: input.source,
    error_class: input.errorClass,
    error_subclass: input.errorSubclass,
    action: input.action,
    attempt: input.attempt,
    max_attempts: input.maxAttempts,
    backoff_ms: input.backoffMs,
    blocked_by_idempotency: input.blockedByIdempotency,
  }
}

export async function sleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return
  }
  await new Promise((resolve) => setTimeout(resolve, ms))
}
