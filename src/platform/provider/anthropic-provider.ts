import { stream as anthropicStream } from '../../api/client.js'
import type { IProvider, ProviderHealth } from '../../architecture/contracts/provider.js'
import type { MessageParams, StreamEvent } from '../../types.js'

export const anthropicProvider: IProvider = {
  name: 'anthropic',

  stream(params: MessageParams): AsyncGenerator<StreamEvent> {
    return anthropicStream(params)
  },

  async healthcheck(): Promise<ProviderHealth> {
    return {
      status: 'unknown',
      checkedAt: new Date().toISOString(),
      detail: 'Health check endpoint is not implemented in Phase 0.',
    }
  },
}
