import type { BudgetMetric } from './budget.js'
import type { ContextHealthSnapshot, ContextHealthStatus } from './context-health.js'

export type ContextSignalEventType = 'context.warning' | 'context.blocking'
export type ContextSignalReasonCode = 'context_near_limit' | 'context_limit_exceeded'

export interface ContextSignalEvent {
  eventType: ContextSignalEventType
  reasonCode: ContextSignalReasonCode
  metric: BudgetMetric
  actual: number
  limit: number
  ratio: number
  source: ContextHealthSnapshot['source']
  estimated: boolean
  turnId: string
  timestamp: string
}

interface BuildContextSignalEventsInput {
  turnId: string
  snapshot: ContextHealthSnapshot
  previousStatus: ContextHealthStatus | null
  dedupeKeys?: Set<string>
  warningRatio?: number
  timestamp?: string
}

interface MetricSnapshot {
  metric: BudgetMetric
  actual: number
  limit: number | null
  estimated: boolean
}

const DEFAULT_WARNING_RATIO = 0.8

export function buildContextSignalEvents(input: BuildContextSignalEventsInput): ContextSignalEvent[] {
  const metrics = extractMetricSnapshots(input.snapshot)
  const warningRatio = normalizeWarningRatio(
    input.warningRatio ?? Number.parseFloat(process.env.ZHGU_CONTEXT_WARNING_RATIO || ''),
  )
  const timestamp = input.timestamp ?? new Date().toISOString()

  const events: ContextSignalEvent[] = []
  const isWarningTransition = input.previousStatus === 'ok' && input.snapshot.status === 'warning'

  if (isWarningTransition) {
    for (const metric of metrics) {
      if (metric.limit === null || metric.limit <= 0) {
        continue
      }
      const ratio = metric.actual / metric.limit
      if (ratio < warningRatio || metric.actual > metric.limit) {
        continue
      }

      events.push({
        eventType: 'context.warning',
        reasonCode: 'context_near_limit',
        metric: metric.metric,
        actual: metric.actual,
        limit: metric.limit,
        ratio,
        source: input.snapshot.source,
        estimated: metric.estimated,
        turnId: input.turnId,
        timestamp,
      })
    }
  }

  if (input.snapshot.status === 'blocking') {
    for (const metric of metrics) {
      if (metric.limit === null || metric.limit <= 0 || metric.actual <= metric.limit) {
        continue
      }
      const ratio = metric.actual / metric.limit
      events.push({
        eventType: 'context.blocking',
        reasonCode: 'context_limit_exceeded',
        metric: metric.metric,
        actual: metric.actual,
        limit: metric.limit,
        ratio,
        source: input.snapshot.source,
        estimated: metric.estimated,
        turnId: input.turnId,
        timestamp,
      })
    }
  }

  if (!input.dedupeKeys) {
    return events
  }

  return events.filter((event) => {
    const key = `${event.turnId}:${event.metric}:${event.reasonCode}`
    if (input.dedupeKeys?.has(key)) {
      return false
    }
    input.dedupeKeys?.add(key)
    return true
  })
}

function extractMetricSnapshots(snapshot: ContextHealthSnapshot): MetricSnapshot[] {
  return [
    {
      metric: 'context_tokens',
      actual: snapshot.usage.context,
      limit: snapshot.limits.maxContext,
      estimated: snapshot.estimated.context,
    },
    {
      metric: 'input_tokens',
      actual: snapshot.usage.input,
      limit: snapshot.limits.maxInput,
      estimated: snapshot.estimated.input,
    },
    {
      metric: 'output_tokens',
      actual: snapshot.usage.output,
      limit: snapshot.limits.maxOutput,
      estimated: snapshot.estimated.output,
    },
  ]
}

function normalizeWarningRatio(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_WARNING_RATIO
  }
  if (value < 0) {
    return 0
  }
  if (value > 1) {
    return 1
  }
  return value
}
