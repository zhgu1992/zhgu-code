export type IntegrationType = 'builtin' | 'mcp' | 'plugin' | 'skill'

export interface IntegrationDescriptor {
  id: string
  name: string
  type: IntegrationType
  enabled: boolean
  version?: string
}

export interface IntegrationRegistry {
  list(): IntegrationDescriptor[]
}

export * from './mcp/types.js'
export * from './mcp/lifecycle.js'
export * from './plugin/types.js'
export * from './plugin/loader.js'
export * from './registry/types.js'
export * from './registry/adapter.js'
export * from './security/types.js'
export * from './security/guard.js'
export * from './security/circuit-breaker.js'
