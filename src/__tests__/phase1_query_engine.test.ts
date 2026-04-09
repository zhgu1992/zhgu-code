import { describe, expect, test } from 'bun:test'
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

describe('Phase 1 / WP1-B Query engine decomposition', () => {
  test('QENG-001 normal done path returns completed', async () => {
    const state = createConsumerState()
    const seen: string[] = []
    const outcome = await consumeStreamEvents(
      makeStream([
        { type: 'thinking', thinking: 't1' },
        { type: 'text', text: 'hello' },
        { type: 'done' },
      ]),
      state,
      {
        onThinkingChunk: () => {
          seen.push('thinking')
        },
        onTextChunk: () => {
          seen.push('text')
        },
        onToolUseStart: () => {
          seen.push('tool_use_start')
        },
        onToolInputComplete: async () => 'completed',
        onLegacyToolUse: async () => 'completed',
        onDone: () => {
          seen.push('done')
        },
      },
    )

    expect(outcome).toBe('completed')
    expect(seen).toEqual(['thinking', 'text', 'done'])
  })

  test('QENG-002 tool handoff path returns handoff', async () => {
    const state = createConsumerState()
    const outcome = await consumeStreamEvents(
      makeStream([
        { type: 'tool_use_start', id: 'tool_1', name: 'Read', index: 0 },
        { type: 'tool_input_complete', index: 0, input: { file_path: 'README.md' } },
      ]),
      state,
      {
        onThinkingChunk: () => {},
        onTextChunk: () => {},
        onToolUseStart: (event, s) => {
          s.currentTool = { id: event.id, name: event.name, input: {} }
        },
        onToolInputComplete: async () => 'handoff',
        onLegacyToolUse: async () => 'completed',
        onDone: () => {},
      },
    )

    expect(outcome).toBe('handoff')
  })

  test('QENG-003 permission deny stop path returns stopped', async () => {
    const state = createConsumerState()
    const outcome = await consumeStreamEvents(
      makeStream([{ type: 'tool_use', id: 'tool_2', name: 'Bash', input: { cmd: 'echo hi' } }]),
      state,
      {
        onThinkingChunk: () => {},
        onTextChunk: () => {},
        onToolUseStart: () => {},
        onToolInputComplete: async () => 'completed',
        onLegacyToolUse: async () => 'stopped',
        onDone: () => {},
      },
    )

    expect(outcome).toBe('stopped')
  })

  test('QENG-004 tool_start legacy event is ignored safely', async () => {
    const state = createConsumerState()
    const outcome = await consumeStreamEvents(
      makeStream([{ type: 'tool_start', id: 'tool_3', name: 'Legacy' }, { type: 'done' }]),
      state,
      {
        onThinkingChunk: () => {},
        onTextChunk: () => {},
        onToolUseStart: () => {},
        onToolInputComplete: async () => 'completed',
        onLegacyToolUse: async () => 'completed',
        onDone: () => {},
      },
    )

    expect(outcome).toBe('completed')
  })

  test('QENG-005 tool_input_complete without active tool remains stable', async () => {
    const state = createConsumerState()
    const outcome = await consumeStreamEvents(
      makeStream([{ type: 'tool_input_complete', index: 0, input: { foo: 'bar' } }]),
      state,
      {
        onThinkingChunk: () => {},
        onTextChunk: () => {},
        onToolUseStart: () => {},
        onToolInputComplete: async () => 'completed',
        onLegacyToolUse: async () => 'completed',
        onDone: () => {},
      },
    )

    expect(outcome).toBe('completed')
    expect(state.currentTool).toBeNull()
  })
})
