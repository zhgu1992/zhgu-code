import type { MessageParams, StreamEvent } from '../../definitions/types/index.js'

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
