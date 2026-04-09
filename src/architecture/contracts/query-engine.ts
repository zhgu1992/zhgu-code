import type { AppStore } from '../../state/store.js'

export type QueryTurnState =
  | 'idle'
  | 'streaming'
  | 'awaiting-permission'
  | 'tool-running'
  | 'recovering'
  | 'stopped'

export type QueryTurnStopReason =
  | 'completed'
  | 'permission_denied'
  | 'recovery_failed'
  | 'cancelled'
  | 'budget_exceeded'
  | 'fatal_error'

export type QueryTurnEvent =
  | 'turn_start'
  | 'tool_use_detected'
  | 'permission_approved'
  | 'permission_denied'
  | 'tool_result_written'
  | 'assistant_done'
  | 'recoverable_error'
  | 'recovery_succeeded'
  | 'recovery_failed'
  | 'retry_exhausted'
  | 'user_cancelled'
  | 'budget_exceeded'
  | 'fatal_error'

export interface QueryTurnTransition {
  turnId: string | null
  from: QueryTurnState
  to: QueryTurnState
  event: QueryTurnEvent
  reason?: QueryTurnStopReason
}

export interface QueryTurnBudget {
  maxInputTokens?: number
  maxOutputTokens?: number
  maxContextTokens?: number
}

export interface QueryOptions {
  quiet?: boolean
  emitStdout?: boolean
  turnId?: string
  budget?: QueryTurnBudget
  onTurnTransition?: (transition: QueryTurnTransition) => void
}

export interface IQueryEngine {
  query(store: AppStore, options?: QueryOptions): Promise<void>
}
