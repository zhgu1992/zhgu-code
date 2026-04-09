import type { MessageParams, StreamEvent } from '../../types.js'

export interface ProviderHealth {
  status: 'healthy' | 'degraded' | 'down' | 'unknown'
  checkedAt: string
  detail?: string
}

export interface IProvider {
  name: string
  stream(params: MessageParams): AsyncGenerator<StreamEvent>
  healthcheck(): Promise<ProviderHealth>
}
