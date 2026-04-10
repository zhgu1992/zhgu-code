import { resolve } from 'node:path'
import type { ContextHealthSnapshot } from './context-health.js'
import { loadTraceEvents } from '../../observability/replay.js'

interface ContextSnapshotRecord {
  snapshot: ContextHealthSnapshot
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

function isStatus(value: unknown): value is ContextHealthSnapshot['status'] {
  return value === 'ok' || value === 'warning' || value === 'blocking'
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
