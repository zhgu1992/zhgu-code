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
