import type { QueryTurnEvent } from '../../architecture/contracts/query-engine.js'
import type { QueryErrorClass } from './errors.js'

export type RecoveryAction = 'retry' | 'stop' | 'fatal'

export interface RecoveryDecision {
  action: RecoveryAction
  event: QueryTurnEvent
  maxAttempts: number
  backoffMs: number
}

interface RecoveryPolicy {
  maxAttempts: number
  backoffMs: number
  exhaustedEvent: QueryTurnEvent
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

export function decideRecovery(errorClass: QueryErrorClass, attempt: number): RecoveryDecision {
  if (errorClass === 'permission_denied') {
    return { action: 'stop', event: 'permission_denied', maxAttempts: 0, backoffMs: 0 }
  }
  if (errorClass === 'budget_exceeded') {
    return { action: 'stop', event: 'budget_exceeded', maxAttempts: 0, backoffMs: 0 }
  }
  if (errorClass === 'non_recoverable') {
    return { action: 'fatal', event: 'fatal_error', maxAttempts: 0, backoffMs: 0 }
  }

  const policy = RECOVERY_POLICIES[errorClass]
  if (!policy) {
    return { action: 'fatal', event: 'fatal_error', maxAttempts: 0, backoffMs: 0 }
  }

  if (attempt < policy.maxAttempts) {
    return {
      action: 'retry',
      event: 'recoverable_error',
      maxAttempts: policy.maxAttempts,
      backoffMs: policy.backoffMs,
    }
  }

  return {
    action: 'stop',
    event: policy.exhaustedEvent,
    maxAttempts: policy.maxAttempts,
    backoffMs: policy.backoffMs,
  }
}

export async function sleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return
  }
  await new Promise((resolve) => setTimeout(resolve, ms))
}
