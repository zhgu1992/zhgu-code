import { createSpanId } from '../../../observability/ids.js'
import { getTraceBus } from '../../../observability/trace-bus.js'
import { getTools } from '../../../tools/registry.js'
import type { Tool } from '../../../definitions/types/index.js'
import type { McpLifecycleSnapshot, McpStructuredReason } from '../mcp/types.js'
import type {
  PluginSkillLoadItem,
  PluginSkillLoaderSnapshot,
  PluginSkillStructuredReason,
} from '../plugin/types.js'
import type {
  CapabilityDescriptor,
  CapabilityFilters,
  CapabilityReason,
  CapabilitySource,
  CapabilityState,
  ExternalCapabilityInput,
  IntegrationRegistryAdapter,
  IntegrationRegistryRebuildInput,
  IntegrationRegistrySummary,
  ModelToolSchema,
  ToolCallResolution,
} from './types.js'

interface ToolRegistryLike {
  getAll(): Tool[]
}

export interface CreateIntegrationRegistryAdapterOptions {
  sessionId?: string
  traceId?: string
  module?: string
  toolRegistry?: ToolRegistryLike
}

const DEFAULT_MODULE = 'platform.integration.registry.adapter'

const SOURCE_PRIORITY: Record<CapabilitySource, number> = {
  builtin: 0,
  mcp: 1,
  plugin: 2,
  skill: 3,
}

export function createRegistryNotCallableReason(args: {
  source: CapabilitySource
  toolName: string
  module: string
  detail?: string
}): CapabilityReason {
  return {
    source: args.source,
    module: args.module,
    reasonCode: 'registry_not_callable',
    userMessage: `Tool "${args.toolName}" is not callable from integration registry.`,
    retryable: false,
    detail: args.detail,
  }
}

export function createIntegrationRegistryAdapter(
  options: CreateIntegrationRegistryAdapterOptions = {},
): IntegrationRegistryAdapter {
  const moduleName = options.module ?? DEFAULT_MODULE
  const toolRegistry = options.toolRegistry ?? getTools()

  let capabilities: CapabilityDescriptor[] = []
  let modelCallableTools: ModelToolSchema[] = []
  let modelToolOwners = new Map<string, CapabilityDescriptor>()

  function rebuild(input: IntegrationRegistryRebuildInput = {}): IntegrationRegistrySummary {
    const nextCapabilities: CapabilityDescriptor[] = [
      ...mapBuiltinTools(toolRegistry.getAll()),
      ...mapMcpSnapshots(input.mcpSnapshots ?? []),
      ...mapPluginSnapshot(input.pluginSnapshot),
      ...mapExternalCapabilities(input.externalCapabilities ?? []),
    ]

    nextCapabilities.sort(compareCapabilities)
    const conflicts = buildModelToolPool(nextCapabilities)
    capabilities = nextCapabilities

    const summary: IntegrationRegistrySummary = {
      total: capabilities.length,
      callable: capabilities.filter((item) => item.callable).length,
      disabled: capabilities.filter((item) => item.state === 'disabled').length,
      conflicts,
      sourceCounts: countBySource(capabilities),
    }

    emitSummary(summary)
    return summary
  }

  return {
    rebuild,
    listCapabilities(filters?: CapabilityFilters): CapabilityDescriptor[] {
      return capabilities
        .filter((item) => matchesFilters(item, filters))
        .map((item) => ({ ...item }))
    },

    getCapability(capabilityId: string): CapabilityDescriptor | undefined {
      const found = capabilities.find((item) => item.capabilityId === capabilityId)
      return found ? { ...found } : undefined
    },

    listModelCallableTools(): ModelToolSchema[] {
      return modelCallableTools.map((item) => ({ ...item }))
    },

    resolveToolCall(toolName: string): ToolCallResolution {
      const owner = modelToolOwners.get(toolName)
      if (owner && owner.callable) {
        return {
          callable: true,
          capability: { ...owner },
        }
      }

      const candidate = capabilities.find((item) => item.modelTool?.name === toolName)
      if (candidate) {
        return {
          callable: false,
          capability: { ...candidate },
          reason:
            candidate.reason ??
            createRegistryNotCallableReason({
              source: candidate.source,
              toolName,
              module: moduleName,
            }),
        }
      }

      return {
        callable: false,
        reason: createRegistryNotCallableReason({
          source: 'builtin',
          toolName,
          module: moduleName,
          detail: 'tool_not_registered',
        }),
      }
    },
  }

  function emitSummary(summary: IntegrationRegistrySummary): void {
    if (!options.sessionId || !options.traceId) {
      return
    }

    getTraceBus().emit({
      stage: 'provider',
      event: 'integration_registry_rebuilt',
      status: 'ok',
      session_id: options.sessionId,
      trace_id: options.traceId,
      span_id: createSpanId(),
      payload: {
        module: moduleName,
        total: summary.total,
        callable: summary.callable,
        disabled: summary.disabled,
        conflicts: summary.conflicts,
        sourceCounts: summary.sourceCounts,
      },
    })
  }

  function buildModelToolPool(nextCapabilities: CapabilityDescriptor[]): number {
    const nextOwners = new Map<string, CapabilityDescriptor>()
    const nextTools: ModelToolSchema[] = []
    let conflicts = 0

    for (const capability of nextCapabilities) {
      if (!capability.callable || !capability.modelTool) {
        continue
      }

      const toolName = capability.modelTool.name
      const currentOwner = nextOwners.get(toolName)
      if (!currentOwner) {
        nextOwners.set(toolName, capability)
        nextTools.push(capability.modelTool)
        continue
      }

      conflicts += 1

      if (currentOwner.source === 'builtin') {
        continue
      }
      if (capability.source !== 'builtin') {
        continue
      }

      nextOwners.set(toolName, capability)
      const index = nextTools.findIndex((item) => item.name === toolName)
      if (index >= 0) {
        nextTools[index] = capability.modelTool
      }
    }

    modelToolOwners = nextOwners
    modelCallableTools = nextTools
    return conflicts
  }
}

function mapBuiltinTools(tools: Tool[]): CapabilityDescriptor[] {
  return tools.map((tool) => ({
    capabilityId: buildCapabilityId('builtin', 'tool', tool.name),
    id: tool.name,
    name: tool.name,
    type: 'tool',
    source: 'builtin',
    state: 'ready',
    callable: true,
    modelTool: {
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema,
    },
  }))
}

function mapMcpSnapshots(snapshots: McpLifecycleSnapshot[]): CapabilityDescriptor[] {
  return snapshots.map((snapshot) => {
    const state = mapMcpState(snapshot.state)
    return {
      capabilityId: buildCapabilityId('mcp', 'provider', snapshot.providerId),
      id: snapshot.providerId,
      name: snapshot.providerId,
      type: 'provider',
      source: 'mcp',
      version: undefined,
      state,
      callable: state === 'ready' || state === 'degraded',
      reason: mapMcpReason(snapshot.lastReason),
    }
  })
}

function mapPluginSnapshot(snapshot?: PluginSkillLoaderSnapshot): CapabilityDescriptor[] {
  if (!snapshot) {
    return []
  }

  return snapshot.items.map((item) => mapPluginItem(item))
}

function mapPluginItem(item: PluginSkillLoadItem): CapabilityDescriptor {
  const source: CapabilitySource = item.itemType === 'plugin' ? 'plugin' : 'skill'
  const type = item.itemType === 'plugin' ? 'plugin' : 'skill'
  const state = mapPluginState(item.state)

  return {
    capabilityId: buildCapabilityId(source, type, item.id),
    id: item.id,
    name: item.name,
    type,
    source,
    loadedFrom: item.loadedFrom,
    version: item.version,
    state,
    callable: state === 'ready' || state === 'degraded',
    reason: mapPluginReason(item.reason),
  }
}

function mapExternalCapabilities(items: ExternalCapabilityInput[]): CapabilityDescriptor[] {
  return items.map((item) => ({
    capabilityId: buildCapabilityId(item.source, item.type, item.id),
    id: item.id,
    name: item.name,
    type: item.type,
    source: item.source,
    loadedFrom: item.loadedFrom,
    version: item.version,
    state: item.state,
    callable: item.callable,
    reason: item.reason,
    modelTool: item.modelTool,
  }))
}

function mapMcpState(state: McpLifecycleSnapshot['state']): CapabilityState {
  if (state === 'ready') {
    return 'ready'
  }
  if (state === 'degraded') {
    return 'degraded'
  }
  if (state === 'disabled') {
    return 'disabled'
  }
  return 'discovered'
}

function mapPluginState(state: PluginSkillLoadItem['state']): CapabilityState {
  if (state === 'loaded') {
    return 'ready'
  }
  if (state === 'disabled') {
    return 'disabled'
  }
  return 'discovered'
}

function mapMcpReason(reason?: McpStructuredReason): CapabilityReason | undefined {
  if (!reason) {
    return undefined
  }
  return {
    source: reason.source,
    module: reason.module,
    reasonCode: reason.reasonCode,
    userMessage: reason.userMessage,
    retryable: reason.retryable,
    detail: reason.detail,
  }
}

function mapPluginReason(reason?: PluginSkillStructuredReason): CapabilityReason | undefined {
  if (!reason) {
    return undefined
  }
  return {
    source: reason.source,
    module: reason.module,
    reasonCode: reason.reasonCode,
    userMessage: reason.userMessage,
    retryable: reason.retryable,
    detail: reason.detail,
  }
}

function compareCapabilities(a: CapabilityDescriptor, b: CapabilityDescriptor): number {
  const sourceDiff = SOURCE_PRIORITY[a.source] - SOURCE_PRIORITY[b.source]
  if (sourceDiff !== 0) {
    return sourceDiff
  }
  const nameDiff = a.name.localeCompare(b.name)
  if (nameDiff !== 0) {
    return nameDiff
  }
  return a.capabilityId.localeCompare(b.capabilityId)
}

function countBySource(
  items: CapabilityDescriptor[],
): Record<CapabilitySource, number> {
  const counts: Record<CapabilitySource, number> = {
    builtin: 0,
    mcp: 0,
    plugin: 0,
    skill: 0,
  }

  for (const item of items) {
    counts[item.source] += 1
  }

  return counts
}

function buildCapabilityId(source: CapabilitySource, type: string, id: string): string {
  return `${source}:${type}:${id}`
}

function matchesFilters(item: CapabilityDescriptor, filters?: CapabilityFilters): boolean {
  if (!filters) {
    return true
  }
  if (filters.callable !== undefined && item.callable !== filters.callable) {
    return false
  }
  if (!matchesValue(item.source, filters.source)) {
    return false
  }
  if (!matchesValue(item.type, filters.type)) {
    return false
  }
  if (!matchesValue(item.state, filters.state)) {
    return false
  }
  return true
}

function matchesValue<T extends string>(value: T, expected?: T | T[]): boolean {
  if (expected === undefined) {
    return true
  }
  if (Array.isArray(expected)) {
    return expected.includes(value)
  }
  return value === expected
}
