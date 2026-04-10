import type { QueryTurnBudget } from '../../architecture/contracts/query-engine.js'
import type { Message, MessageContent, MessageParams } from '../../definitions/types/index.js'

export type BudgetMetric = 'input_tokens' | 'output_tokens' | 'context_tokens'

export interface BudgetUsageSnapshot {
  inputTokens: number
  outputTokens: number
  contextTokens: number
}

export interface BudgetEstimateFlags {
  inputTokensEstimated?: boolean
  outputTokensEstimated?: boolean
  contextTokensEstimated?: boolean
}

export interface BudgetExceeded {
  metric: BudgetMetric
  limit: number
  actual: number
  estimated: boolean
}

export interface BudgetEvaluationInput {
  usage: BudgetUsageSnapshot
  estimated?: BudgetEstimateFlags
}

export function estimateTokensFromText(text: string): number {
  if (!text) {
    return 0
  }
  return Math.ceil(text.length / 4)
}

export function estimateContextTokens(
  systemPrompt: MessageParams['system'],
  messages: Message[],
): number {
  const systemTokens = estimateSystemPromptTokens(systemPrompt)
  const messageTokens = messages.reduce((total, message) => {
    return total + estimateMessageTokens(message.content)
  }, 0)
  return systemTokens + messageTokens
}

export function evaluateBudget(
  budget: QueryTurnBudget | undefined,
  input: BudgetEvaluationInput,
): BudgetExceeded | null {
  if (!budget) {
    return null
  }

  const { usage, estimated } = input
  const checks: Array<{
    metric: BudgetMetric
    limit: number | undefined
    actual: number
    estimated: boolean
  }> = [
    {
      metric: 'context_tokens',
      limit: budget.maxContextTokens,
      actual: usage.contextTokens,
      estimated: estimated?.contextTokensEstimated ?? false,
    },
    {
      metric: 'input_tokens',
      limit: budget.maxInputTokens,
      actual: usage.inputTokens,
      estimated: estimated?.inputTokensEstimated ?? false,
    },
    {
      metric: 'output_tokens',
      limit: budget.maxOutputTokens,
      actual: usage.outputTokens,
      estimated: estimated?.outputTokensEstimated ?? false,
    },
  ]

  for (const check of checks) {
    if (check.limit === undefined) {
      continue
    }
    if (check.actual > check.limit) {
      return {
        metric: check.metric,
        limit: check.limit,
        actual: check.actual,
        estimated: check.estimated,
      }
    }
  }

  return null
}

export function formatBudgetExceededMessage(exceeded: BudgetExceeded): string {
  const metricLabel =
    exceeded.metric === 'context_tokens'
      ? 'context tokens'
      : exceeded.metric === 'input_tokens'
        ? 'input tokens'
        : 'output tokens'
  const estimateSuffix = exceeded.estimated ? ' (estimated)' : ''
  return `Budget exceeded: ${metricLabel}${estimateSuffix} limit=${exceeded.limit}, actual=${exceeded.actual}.`
}

function estimateMessageTokens(content: MessageContent): number {
  if (typeof content === 'string') {
    return estimateTokensFromText(content)
  }

  return content.reduce((total, block) => {
    switch (block.type) {
      case 'text':
        return total + estimateTokensFromText(block.text)
      case 'thinking':
        return total + estimateTokensFromText(block.thinking)
      case 'tool_use':
        return total + estimateTokensFromText(JSON.stringify(block.input))
      case 'tool_result':
        return total + estimateTokensFromText(block.content)
      default:
        return total
    }
  }, 0)
}

function estimateSystemPromptTokens(systemPrompt: MessageParams['system']): number {
  if (!systemPrompt) {
    return 0
  }

  if (typeof systemPrompt === 'string') {
    return estimateTokensFromText(systemPrompt)
  }

  return systemPrompt.reduce((total, block) => total + estimateTokensFromText(block.text), 0)
}
