import { createSpanId } from '../../../observability/ids.js'
import { getTraceBus } from '../../../observability/trace-bus.js'
import type {
  CapabilityDescriptor,
  CapabilitySource,
  CapabilityType,
  ModelToolSchema,
} from './types.js'

export interface IntegrationGraphNode {
  capabilityId: string
  name: string
  type: CapabilityType
  source: CapabilitySource
  state: CapabilityDescriptor['state']
  callable: boolean
  reasonCode?: string
  providerId?: string
  pluginId?: string
  loadedFrom?: CapabilityDescriptor['loadedFrom']
  transport?: string
  protocol?: string
}

export interface IntegrationGraphEdge {
  from: string
  to: string
  relation: 'belongs_to_provider' | 'belongs_to_plugin'
}

export interface IntegrationGraphConflictGroup {
  toolName: string
  ownerCapabilityId: string | null
  candidateCapabilityIds: string[]
  resolutionPolicy: 'builtin_preferred'
}

export interface IntegrationGraphSummary {
  total: number
  callable: number
  disabled: number
  conflicts: number
  sourceCounts: Record<CapabilitySource, number>
}

export interface IntegrationRegistryGraphSnapshot {
  nodes: IntegrationGraphNode[]
  edges: IntegrationGraphEdge[]
  summary: IntegrationGraphSummary
  conflictGroups: IntegrationGraphConflictGroup[]
}

export interface BuildIntegrationRegistryGraphSnapshotInput {
  capabilities: CapabilityDescriptor[]
  modelCallableTools: ModelToolSchema[]
}

export interface BuildIntegrationRegistryGraphSnapshotOptions {
  sessionId?: string
  traceId?: string
  module?: string
}

const DEFAULT_MODULE = 'platform.integration.registry.graph'

const SOURCE_PRIORITY: Record<CapabilitySource, number> = {
  builtin: 0,
  mcp: 1,
  plugin: 2,
  skill: 3,
}

export function buildIntegrationRegistryGraphSnapshot(
  input: BuildIntegrationRegistryGraphSnapshotInput,
  options: BuildIntegrationRegistryGraphSnapshotOptions = {},
): IntegrationRegistryGraphSnapshot {
  const snapshot = buildSnapshot(input)
  emitGraphSnapshot(snapshot, options)
  return snapshot
}

function buildSnapshot(input: BuildIntegrationRegistryGraphSnapshotInput): IntegrationRegistryGraphSnapshot {
  const nodes = input.capabilities.map((capability) => ({
    capabilityId: capability.capabilityId,
    name: capability.name,
    type: capability.type,
    source: capability.source,
    state: capability.state,
    callable: capability.callable,
    reasonCode: capability.reason?.reasonCode,
    providerId: capability.providerId,
    pluginId: capability.pluginId,
    loadedFrom: capability.loadedFrom,
    transport: capability.transport,
    protocol: capability.protocol,
  }))

  const edges = buildEdges(input.capabilities)
  const conflictGroups = buildConflictGroups(input.capabilities, input.modelCallableTools)

  const sourceCounts: Record<CapabilitySource, number> = {
    builtin: 0,
    mcp: 0,
    plugin: 0,
    skill: 0,
  }
  for (const node of nodes) {
    sourceCounts[node.source] += 1
  }

  const summary: IntegrationGraphSummary = {
    total: nodes.length,
    callable: nodes.filter((node) => node.callable).length,
    disabled: nodes.filter((node) => node.state === 'disabled').length,
    conflicts: conflictGroups.length,
    sourceCounts,
  }

  return {
    nodes,
    edges,
    summary,
    conflictGroups,
  }
}

function buildEdges(capabilities: CapabilityDescriptor[]): IntegrationGraphEdge[] {
  const providerById = new Map<string, string>()
  const pluginById = new Map<string, string>()

  for (const capability of capabilities) {
    if (capability.source === 'mcp' && capability.type === 'provider') {
      providerById.set(capability.providerId ?? capability.id, capability.capabilityId)
    }
    if (capability.source === 'plugin' && capability.type === 'plugin') {
      pluginById.set(capability.id, capability.capabilityId)
    }
  }

  const edges: IntegrationGraphEdge[] = []
  for (const capability of capabilities) {
    if (capability.source === 'mcp' && capability.type === 'tool') {
      const to = providerById.get(capability.providerId ?? '')
      if (to) {
        edges.push({
          from: capability.capabilityId,
          to,
          relation: 'belongs_to_provider',
        })
      }
    }
    if (capability.source === 'skill' && capability.type === 'skill') {
      const to = capability.pluginId ? pluginById.get(capability.pluginId) : undefined
      if (to) {
        edges.push({
          from: capability.capabilityId,
          to,
          relation: 'belongs_to_plugin',
        })
      }
    }
  }

  return edges
}

function buildConflictGroups(
  capabilities: CapabilityDescriptor[],
  modelCallableTools: ModelToolSchema[],
): IntegrationGraphConflictGroup[] {
  const candidatesByToolName = new Map<string, CapabilityDescriptor[]>()
  for (const capability of capabilities) {
    const toolName = capability.modelTool?.name
    if (!toolName) {
      continue
    }
    const list = candidatesByToolName.get(toolName)
    if (list) {
      list.push(capability)
    } else {
      candidatesByToolName.set(toolName, [capability])
    }
  }

  const modelCallableNames = new Set(modelCallableTools.map((item) => item.name))
  const groups: IntegrationGraphConflictGroup[] = []

  for (const [toolName, candidates] of candidatesByToolName.entries()) {
    if (candidates.length < 2) {
      continue
    }

    const ownerCapabilityId = modelCallableNames.has(toolName)
      ? pickOwner(candidates)?.capabilityId ?? null
      : null

    groups.push({
      toolName,
      ownerCapabilityId,
      candidateCapabilityIds: candidates
        .map((candidate) => candidate.capabilityId)
        .sort((a, b) => a.localeCompare(b)),
      resolutionPolicy: 'builtin_preferred',
    })
  }

  groups.sort((a, b) => a.toolName.localeCompare(b.toolName))
  return groups
}

function pickOwner(candidates: CapabilityDescriptor[]): CapabilityDescriptor | null {
  const callable = candidates.filter((candidate) => candidate.callable)
  if (callable.length === 0) {
    return null
  }

  return [...callable].sort((a, b) => {
    const sourceDiff = SOURCE_PRIORITY[a.source] - SOURCE_PRIORITY[b.source]
    if (sourceDiff !== 0) {
      return sourceDiff
    }
    return a.capabilityId.localeCompare(b.capabilityId)
  })[0] ?? null
}

function emitGraphSnapshot(
  snapshot: IntegrationRegistryGraphSnapshot,
  options: BuildIntegrationRegistryGraphSnapshotOptions,
): void {
  if (!options.sessionId || !options.traceId) {
    return
  }

  getTraceBus().emit({
    stage: 'provider',
    event: 'integration_registry_graph_snapshot',
    status: 'ok',
    session_id: options.sessionId,
    trace_id: options.traceId,
    span_id: createSpanId(),
    payload: {
      module: options.module ?? DEFAULT_MODULE,
      total: snapshot.summary.total,
      callable: snapshot.summary.callable,
      disabled: snapshot.summary.disabled,
      conflicts: snapshot.summary.conflicts,
      sourceCounts: snapshot.summary.sourceCounts,
      conflictGroupCount: snapshot.conflictGroups.length,
      snapshot,
    },
  })
}
