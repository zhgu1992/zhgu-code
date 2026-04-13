import type { Tool } from '../../../definitions/types/index.js'
import type { IntegrationLoadedFrom } from '../plugin/types.js'
import type { IntegrationSecurityContext } from '../security/types.js'

export type CapabilitySource = 'builtin' | 'mcp' | 'plugin' | 'skill'

export type CapabilityType = 'tool' | 'provider' | 'plugin' | 'skill'

export type CapabilityState = 'ready' | 'degraded' | 'disabled' | 'discovered'

export interface CapabilityReason {
  source: CapabilitySource
  module: string
  reasonCode: string
  userMessage: string
  retryable: boolean
  detail?: string
}

export interface ModelToolSchema {
  name: string
  description: string
  input_schema: Tool['inputSchema']
}

export interface CapabilityDescriptor {
  capabilityId: string
  id: string
  name: string
  type: CapabilityType
  source: CapabilitySource
  providerId?: string
  pluginId?: string
  transport?: string
  protocol?: string
  loadedFrom?: IntegrationLoadedFrom
  version?: string
  state: CapabilityState
  callable: boolean
  reason?: CapabilityReason
  modelTool?: ModelToolSchema
}

export interface CapabilityFilters {
  source?: CapabilitySource | CapabilitySource[]
  type?: CapabilityType | CapabilityType[]
  state?: CapabilityState | CapabilityState[]
  callable?: boolean
}

export interface ExternalCapabilityInput {
  id: string
  name: string
  type: CapabilityType
  source: Exclude<CapabilitySource, 'builtin'>
  providerId?: string
  pluginId?: string
  transport?: string
  protocol?: string
  loadedFrom?: IntegrationLoadedFrom
  version?: string
  state: CapabilityState
  callable: boolean
  reason?: CapabilityReason
  modelTool?: ModelToolSchema
}

export interface IntegrationRegistryRebuildInput {
  mcpSnapshots?: import('../mcp/types.js').McpLifecycleSnapshot[]
  pluginSnapshot?: import('../plugin/types.js').PluginSkillLoaderSnapshot
  externalCapabilities?: ExternalCapabilityInput[]
  security?: IntegrationSecurityContext
}

export interface IntegrationRegistrySummary {
  total: number
  callable: number
  disabled: number
  conflicts: number
  sourceCounts: Record<CapabilitySource, number>
}

export type ToolCallResolution =
  | { callable: true; capability: CapabilityDescriptor }
  | { callable: false; reason: CapabilityReason; capability?: CapabilityDescriptor }

export interface IntegrationRegistryAdapter {
  rebuild(input?: IntegrationRegistryRebuildInput): IntegrationRegistrySummary
  listCapabilities(filters?: CapabilityFilters): CapabilityDescriptor[]
  getCapability(capabilityId: string): CapabilityDescriptor | undefined
  listModelCallableTools(): ModelToolSchema[]
  resolveToolCall(toolName: string): ToolCallResolution
}
