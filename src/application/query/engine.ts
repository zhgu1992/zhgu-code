import { query as runQuery } from '../../core/query.js'
import type { IQueryEngine, QueryOptions } from '../../architecture/contracts/query-engine.js'
import type { AppStore } from '../../state/store.js'

export const legacyQueryEngine: IQueryEngine = {
  query(store: AppStore, options?: QueryOptions): Promise<void> {
    return runQuery(store, options)
  },
}
