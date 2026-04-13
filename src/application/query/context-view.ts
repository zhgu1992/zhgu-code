import { resolve } from 'node:path'
import type { IntegrationRegistryGraphSnapshot } from '../../platform/integration/registry/graph.js'
import type { ContextHealthSnapshot } from './context-health.js'
import { loadTraceEvents } from '../../observability/replay.js'

interface ContextSnapshotRecord {
  snapshot: ContextHealthSnapshot
  updatedAt: string
}

interface IntegrationGraphSnapshotRecord {
  snapshot: IntegrationRegistryGraphSnapshot
  updatedAt: string
}

export interface ContextViewSnapshotResponse {
  type: 'snapshot'
  status: ContextHealthSnapshot['status']
  source: ContextHealthSnapshot['source']
  usage: ContextHealthSnapshot['usage']
  limits: ContextHealthSnapshot['limits']
  estimated: ContextHealthSnapshot['estimated']
  updatedAt: string
}

export interface ContextViewNoDataResponse {
  type: 'no_data'
  reason: 'query_snapshot_unavailable'
  message: string
  actions: string[]
}

export type ContextViewResponse = ContextViewSnapshotResponse | ContextViewNoDataResponse

export interface IntegrationGraphViewSnapshotResponse extends IntegrationRegistryGraphSnapshot {
  type: 'snapshot'
  updatedAt: string
}

export interface IntegrationGraphViewNoDataResponse {
  type: 'no_data'
  reason: 'integration_graph_unavailable'
  message: string
  actions: string[]
}

export type IntegrationGraphViewResponse =
  | IntegrationGraphViewSnapshotResponse
  | IntegrationGraphViewNoDataResponse

export function buildContextView(
  record: ContextSnapshotRecord | null,
  input?: {
    noDataMessage?: string
    noDataActions?: string[]
  },
): ContextViewResponse {
  if (!record) {
    return {
      type: 'no_data',
      reason: 'query_snapshot_unavailable',
      message:
        input?.noDataMessage ??
        'No query context snapshot found. Run at least one query turn first.',
      actions: input?.noDataActions ?? [
        'Run `zhgu-code "<prompt>"` or start interactive REPL and execute one turn',
        'Then rerun `zhgu-code context`',
      ],
    }
  }

  return {
    type: 'snapshot',
    status: record.snapshot.status,
    source: record.snapshot.source,
    usage: record.snapshot.usage,
    limits: record.snapshot.limits,
    estimated: record.snapshot.estimated,
    updatedAt: record.updatedAt,
  }
}

export function buildIntegrationGraphView(
  record: IntegrationGraphSnapshotRecord | null,
  input?: {
    noDataMessage?: string
    noDataActions?: string[]
  },
): IntegrationGraphViewResponse {
  if (!record) {
    return {
      type: 'no_data',
      reason: 'integration_graph_unavailable',
      message:
        input?.noDataMessage ??
        'No integration graph snapshot found. Run at least one query turn first.',
      actions: input?.noDataActions ?? [
        'Run `zhgu-code "<prompt>"` or start interactive REPL and execute one turn',
        'Then rerun `zhgu-code integration graph`',
      ],
    }
  }

  return {
    type: 'snapshot',
    nodes: record.snapshot.nodes,
    edges: record.snapshot.edges,
    summary: record.snapshot.summary,
    conflictGroups: record.snapshot.conflictGroups,
    updatedAt: record.updatedAt,
  }
}

export async function loadLatestContextSnapshotFromTrace(
  traceFilePath = resolve(process.cwd(), process.env.ZHGU_TRACE_FILE || '.trace/trace.jsonl'),
): Promise<ContextSnapshotRecord | null> {
  let events: Awaited<ReturnType<typeof loadTraceEvents>>
  try {
    events = await loadTraceEvents(traceFilePath)
  } catch {
    return null
  }

  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i]
    if (!event || event.stage !== 'query' || event.event !== 'context_health_snapshot') {
      continue
    }
    const snapshot = parseContextHealthSnapshot(event.payload)
    if (!snapshot) {
      continue
    }
    return {
      snapshot,
      updatedAt: event.ts,
    }
  }

  return null
}

export async function loadLatestIntegrationGraphSnapshotFromTrace(
  traceFilePath = resolve(process.cwd(), process.env.ZHGU_TRACE_FILE || '.trace/trace.jsonl'),
): Promise<IntegrationGraphSnapshotRecord | null> {
  let events: Awaited<ReturnType<typeof loadTraceEvents>>
  try {
    events = await loadTraceEvents(traceFilePath)
  } catch {
    return null
  }

  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i]
    if (
      !event ||
      event.stage !== 'provider' ||
      event.event !== 'integration_registry_graph_snapshot'
    ) {
      continue
    }
    const snapshot = parseIntegrationRegistryGraphSnapshot(event.payload)
    if (!snapshot) {
      continue
    }
    return {
      snapshot,
      updatedAt: event.ts,
    }
  }

  return null
}

function parseContextHealthSnapshot(payload: unknown): ContextHealthSnapshot | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }
  const value = payload as Record<string, unknown>

  if (
    !isStatus(value.status) ||
    !isSource(value.source) ||
    !isUsage(value.usage) ||
    !isLimits(value.limits) ||
    !isEstimated(value.estimated)
  ) {
    return null
  }

  return {
    status: value.status,
    source: value.source,
    usage: value.usage,
    limits: value.limits,
    estimated: value.estimated,
  }
}

function parseIntegrationRegistryGraphSnapshot(
  payload: unknown,
): IntegrationRegistryGraphSnapshot | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }
  const value = payload as Record<string, unknown>
  const target = isIntegrationGraphSnapshot(value.snapshot)
    ? (value.snapshot as IntegrationRegistryGraphSnapshot)
    : value

  if (!isIntegrationGraphSnapshot(target)) {
    return null
  }

  return target
}

function isIntegrationGraphSnapshot(value: unknown): value is IntegrationRegistryGraphSnapshot {
  if (!value || typeof value !== 'object') {
    return false
  }
  const snapshot = value as Record<string, unknown>

  if (
    !Array.isArray(snapshot.nodes) ||
    !Array.isArray(snapshot.edges) ||
    !isIntegrationSummary(snapshot.summary) ||
    !Array.isArray(snapshot.conflictGroups)
  ) {
    return false
  }

  return (
    snapshot.nodes.every(isIntegrationNode) &&
    snapshot.edges.every(isIntegrationEdge) &&
    snapshot.conflictGroups.every(isIntegrationConflictGroup)
  )
}

function isIntegrationSummary(
  value: unknown,
): value is IntegrationRegistryGraphSnapshot['summary'] {
  if (!value || typeof value !== 'object') {
    return false
  }
  const summary = value as Record<string, unknown>
  if (
    typeof summary.total !== 'number' ||
    typeof summary.callable !== 'number' ||
    typeof summary.disabled !== 'number' ||
    typeof summary.conflicts !== 'number' ||
    !summary.sourceCounts ||
    typeof summary.sourceCounts !== 'object'
  ) {
    return false
  }
  const sourceCounts = summary.sourceCounts as Record<string, unknown>
  return (
    typeof sourceCounts.builtin === 'number' &&
    typeof sourceCounts.mcp === 'number' &&
    typeof sourceCounts.plugin === 'number' &&
    typeof sourceCounts.skill === 'number'
  )
}

function isIntegrationNode(value: unknown): value is IntegrationRegistryGraphSnapshot['nodes'][number] {
  if (!value || typeof value !== 'object') {
    return false
  }
  const node = value as Record<string, unknown>
  return (
    typeof node.capabilityId === 'string' &&
    typeof node.name === 'string' &&
    isCapabilityType(node.type) &&
    isCapabilitySource(node.source) &&
    isCapabilityState(node.state) &&
    typeof node.callable === 'boolean'
  )
}

function isIntegrationEdge(value: unknown): value is IntegrationRegistryGraphSnapshot['edges'][number] {
  if (!value || typeof value !== 'object') {
    return false
  }
  const edge = value as Record<string, unknown>
  return (
    typeof edge.from === 'string' &&
    typeof edge.to === 'string' &&
    (edge.relation === 'belongs_to_provider' || edge.relation === 'belongs_to_plugin')
  )
}

function isIntegrationConflictGroup(
  value: unknown,
): value is IntegrationRegistryGraphSnapshot['conflictGroups'][number] {
  if (!value || typeof value !== 'object') {
    return false
  }
  const group = value as Record<string, unknown>
  return (
    typeof group.toolName === 'string' &&
    (typeof group.ownerCapabilityId === 'string' || group.ownerCapabilityId === null) &&
    Array.isArray(group.candidateCapabilityIds) &&
    group.candidateCapabilityIds.every((item) => typeof item === 'string') &&
    group.resolutionPolicy === 'builtin_preferred'
  )
}

function isStatus(value: unknown): value is ContextHealthSnapshot['status'] {
  return value === 'ok' || value === 'warning' || value === 'blocking'
}

function isCapabilitySource(value: unknown): value is IntegrationRegistryGraphSnapshot['nodes'][number]['source'] {
  return value === 'builtin' || value === 'mcp' || value === 'plugin' || value === 'skill'
}

function isCapabilityType(value: unknown): value is IntegrationRegistryGraphSnapshot['nodes'][number]['type'] {
  return value === 'tool' || value === 'provider' || value === 'plugin' || value === 'skill'
}

function isCapabilityState(value: unknown): value is IntegrationRegistryGraphSnapshot['nodes'][number]['state'] {
  return value === 'ready' || value === 'degraded' || value === 'disabled' || value === 'discovered'
}

function isSource(value: unknown): value is ContextHealthSnapshot['source'] {
  return value === 'preflight' || value === 'streaming' || value === 'done'
}

function isUsage(value: unknown): value is ContextHealthSnapshot['usage'] {
  if (!value || typeof value !== 'object') {
    return false
  }
  const usage = value as Record<string, unknown>
  return (
    typeof usage.context === 'number' &&
    typeof usage.input === 'number' &&
    typeof usage.output === 'number'
  )
}

function isLimitValue(value: unknown): value is number | null {
  return value === null || typeof value === 'number'
}

function isLimits(value: unknown): value is ContextHealthSnapshot['limits'] {
  if (!value || typeof value !== 'object') {
    return false
  }
  const limits = value as Record<string, unknown>
  return (
    isLimitValue(limits.maxContext) &&
    isLimitValue(limits.maxInput) &&
    isLimitValue(limits.maxOutput)
  )
}

function isEstimated(value: unknown): value is ContextHealthSnapshot['estimated'] {
  if (!value || typeof value !== 'object') {
    return false
  }
  const estimated = value as Record<string, unknown>
  return (
    typeof estimated.context === 'boolean' &&
    typeof estimated.input === 'boolean' &&
    typeof estimated.output === 'boolean'
  )
}
