import { describe, expect, test } from 'bun:test'
import {
  createMessageAppendEvent,
  createSessionStartEvent,
  type TranscriptEvent,
} from '../application/query/transcript/model.js'
import { replayTranscript } from '../application/query/transcript/reader.js'

describe('Phase 1 / WP1-E Transcript replay', () => {
  test('TRC-003 can reconstruct input -> tool -> output main chain', () => {
    const events: TranscriptEvent[] = [
      createSessionStartEvent({
        sessionId: 'sess_replay',
        traceId: 'trace_replay',
        model: 'claude-sonnet-4-6',
        cwd: '/tmp/workspace',
      }),
      createMessageAppendEvent({
        sessionId: 'sess_replay',
        traceId: 'trace_replay',
        turnId: 'turn_1',
        messageId: 'msg_user_1',
        role: 'user',
        content: 'check README',
      }),
      createMessageAppendEvent({
        sessionId: 'sess_replay',
        traceId: 'trace_replay',
        turnId: 'turn_1',
        messageId: 'msg_tool_use_1',
        role: 'assistant',
        content: [{ type: 'tool_use', id: 'tool_1', name: 'Read', input: { file_path: 'README.md' } }],
        isToolResult: true,
      }),
      createMessageAppendEvent({
        sessionId: 'sess_replay',
        traceId: 'trace_replay',
        turnId: 'turn_1',
        messageId: 'msg_tool_result_1',
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'tool_1', content: 'ok' }],
        isToolResult: true,
      }),
      createMessageAppendEvent({
        sessionId: 'sess_replay',
        traceId: 'trace_replay',
        turnId: 'turn_1',
        messageId: 'msg_assistant_1',
        role: 'assistant',
        content: [{ type: 'text', text: 'done' }],
      }),
    ]

    const replay = replayTranscript(events)
    expect(replay.unscopedMessages.length).toBe(0)
    expect(replay.turns.length).toBe(1)
    expect(replay.turns[0]?.input.length).toBe(1)
    expect(replay.turns[0]?.toolChain.length).toBe(1)
    expect(replay.turns[0]?.toolChain[0]).toMatchObject({
      toolUseId: 'tool_1',
      toolResultMessageId: 'msg_tool_result_1',
    })
    expect(replay.turns[0]?.output.length).toBe(1)
    expect(replay.turns[0]?.partial).toBe(false)
  })

  test('TRC-004 marks partial replay when tool_result is missing', () => {
    const events: TranscriptEvent[] = [
      createSessionStartEvent({
        sessionId: 'sess_partial',
        traceId: 'trace_partial',
        model: 'claude-sonnet-4-6',
        cwd: '/tmp/workspace',
      }),
      createMessageAppendEvent({
        sessionId: 'sess_partial',
        traceId: 'trace_partial',
        turnId: 'turn_2',
        messageId: 'msg_user_2',
        role: 'user',
        content: 'check docs',
      }),
      createMessageAppendEvent({
        sessionId: 'sess_partial',
        traceId: 'trace_partial',
        turnId: 'turn_2',
        messageId: 'msg_tool_use_2',
        role: 'assistant',
        content: [{ type: 'tool_use', id: 'tool_2', name: 'Read', input: { file_path: 'docs.md' } }],
        isToolResult: true,
      }),
      createMessageAppendEvent({
        sessionId: 'sess_partial',
        traceId: 'trace_partial',
        turnId: 'turn_2',
        messageId: 'msg_assistant_2',
        role: 'assistant',
        content: [{ type: 'text', text: 'still waiting for tool result' }],
      }),
    ]

    const replay = replayTranscript(events)
    expect(replay.turns.length).toBe(1)
    expect(replay.turns[0]?.partial).toBe(true)
    expect(replay.turns[0]?.gaps).toContain('missing_tool_result:tool_2')
  })
})
