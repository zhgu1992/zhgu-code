import type { QueryOptions } from '../architecture/contracts/query-engine.js'
import { runQuery } from '../application/query/query-runner.js'
import { appendTextDelta } from '../application/query/formatting.js'
import type { AppStore } from '../state/store.js'

export async function query(store: AppStore, options?: QueryOptions): Promise<void> {
  return runQuery(store, options)
}

export { appendTextDelta }
