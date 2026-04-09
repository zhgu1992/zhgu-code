import type { AppStore } from '../../state/store.js'

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
}

export interface IQueryEngine {
  query(store: AppStore, options?: QueryOptions): Promise<void>
}
