import type { QueryTurnBudget } from '../../architecture/contracts/query-engine.js'
import {
  evaluateBudget,
  type BudgetEstimateFlags,
  type BudgetExceeded,
  type BudgetUsageSnapshot,
} from './budget.js'

export type ContextHealthStatus = 'ok' | 'warning' | 'blocking'
export type ContextHealthSource = 'preflight' | 'streaming' | 'done'

export interface ContextHealthSnapshot {
  usage: {
    context: number
    input: number
    output: number
  }
  limits: {
    maxContext: number | null
    maxInput: number | null
    maxOutput: number | null
  }
  status: ContextHealthStatus
  source: ContextHealthSource
  estimated: {
    context: boolean
    input: boolean
    output: boolean
  }
}

export interface ContextHealthEvaluation {
  snapshot: ContextHealthSnapshot
  exceeded: BudgetExceeded | null
}

interface BuildContextHealthSnapshotInput {
  budget?: QueryTurnBudget
  usage: BudgetUsageSnapshot
  estimated?: BudgetEstimateFlags
  source: ContextHealthSource
  warningRatio?: number
}

const DEFAULT_WARNING_RATIO = 0.8

export function buildContextHealthSnapshot(
  input: BuildContextHealthSnapshotInput,
): ContextHealthEvaluation {
  const warningRatio = normalizeWarningRatio(
    input.warningRatio ?? Number.parseFloat(process.env.ZHGU_CONTEXT_WARNING_RATIO || ''),
  )

  const normalizedEstimated = {
    contextTokensEstimated: input.estimated?.contextTokensEstimated ?? false,
    inputTokensEstimated: input.estimated?.inputTokensEstimated ?? false,
    outputTokensEstimated: input.estimated?.outputTokensEstimated ?? false,
  }

  const exceeded = evaluateBudget(input.budget, {
    usage: input.usage,
    estimated: normalizedEstimated,
  })

  const snapshot: ContextHealthSnapshot = {
    usage: {
      context: input.usage.contextTokens,
      input: input.usage.inputTokens,
      output: input.usage.outputTokens,
    },
    limits: {
      maxContext: input.budget?.maxContextTokens ?? null,
      maxInput: input.budget?.maxInputTokens ?? null,
      maxOutput: input.budget?.maxOutputTokens ?? null,
    },
    status: exceeded
      ? 'blocking'
      : isNearLimit(input.budget, input.usage, warningRatio)
        ? 'warning'
        : 'ok',
    source: input.source,
    estimated: {
      context: normalizedEstimated.contextTokensEstimated,
      input: normalizedEstimated.inputTokensEstimated,
      output: normalizedEstimated.outputTokensEstimated,
    },
  }

  return {
    snapshot,
    exceeded,
  }
}

function isNearLimit(
  budget: QueryTurnBudget | undefined,
  usage: BudgetUsageSnapshot,
  warningRatio: number,
): boolean {
  if (!budget) {
    return false
  }

  const checks: Array<{ limit: number | undefined; actual: number }> = [
    { limit: budget.maxContextTokens, actual: usage.contextTokens },
    { limit: budget.maxInputTokens, actual: usage.inputTokens },
    { limit: budget.maxOutputTokens, actual: usage.outputTokens },
  ]

  return checks.some((check) => {
    if (check.limit === undefined || check.limit <= 0) {
      return false
    }
    return check.actual / check.limit >= warningRatio
  })
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
