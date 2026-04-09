import { describe, expect, test } from 'bun:test'
import {
  estimateContextTokens,
  estimateTokensFromText,
  evaluateBudget,
  formatBudgetExceededMessage,
} from '../application/query/budget.js'
import {
  consumeStreamEvents,
  type StreamConsumerState,
} from '../application/query/stream-consumer.js'
import type { StreamEvent } from '../definitions/types/index.js'

async function* makeStream(events: StreamEvent[]): AsyncGenerator<StreamEvent> {
  for (const event of events) {
    yield event
  }
}

function createConsumerState(): StreamConsumerState {
  return {
    assistantContent: [],
    currentText: '',
    currentThinking: '',
    currentTool: null,
  }
}

describe('Phase 1 / WP1-C Budget guard', () => {
  test('BGT-001 evaluateBudget returns null when budget is undefined', () => {
    const result = evaluateBudget(undefined, {
      usage: {
        inputTokens: 10,
        outputTokens: 20,
        contextTokens: 30,
      },
    })
    expect(result).toBeNull()
  })

  test('BGT-002 maxContextTokens can trigger exceeded result', () => {
    const contextTokens = estimateContextTokens('system prompt', [
      {
        role: 'user',
        content: 'hello world',
      },
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'response text' }],
      },
    ])

    const result = evaluateBudget(
      { maxContextTokens: Math.max(0, contextTokens - 1) },
      {
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          contextTokens,
        },
        estimated: { contextTokensEstimated: true },
      },
    )

    expect(result).not.toBeNull()
    expect(result?.metric).toBe('context_tokens')
    expect(result?.estimated).toBe(true)
  })

  test('BGT-003 maxOutputTokens exceeded returns predictable message', () => {
    const outputTokens = estimateTokensFromText('abcdefghijklmno')
    const exceeded = evaluateBudget(
      { maxOutputTokens: outputTokens - 1 },
      {
        usage: {
          inputTokens: 0,
          outputTokens,
          contextTokens: 0,
        },
        estimated: { outputTokensEstimated: true },
      },
    )

    expect(exceeded).not.toBeNull()
    expect(exceeded?.metric).toBe('output_tokens')
    expect(formatBudgetExceededMessage(exceeded!)).toContain('Budget exceeded')
  })

  test('BGT-004 stream consumer stops when text handler returns stopped', async () => {
    const state = createConsumerState()
    const outcome = await consumeStreamEvents(
      makeStream([{ type: 'text', text: 'hello' }, { type: 'done' }]),
      state,
      {
        onThinkingChunk: () => {},
        onTextChunk: () => 'stopped',
        onToolUseStart: () => {},
        onToolInputComplete: async () => 'completed',
        onLegacyToolUse: async () => 'completed',
        onDone: () => {},
      },
    )

    expect(outcome).toBe('stopped')
  })

  test('BGT-005 stream consumer stops when done handler returns stopped', async () => {
    const state = createConsumerState()
    const outcome = await consumeStreamEvents(makeStream([{ type: 'done' }]), state, {
      onThinkingChunk: () => {},
      onTextChunk: () => {},
      onToolUseStart: () => {},
      onToolInputComplete: async () => 'completed',
      onLegacyToolUse: async () => 'completed',
      onDone: () => 'stopped',
    })

    expect(outcome).toBe('stopped')
  })
})
