import { describe, expect, test } from 'bun:test'
import {
  createMessageAppendEvent,
  parseTranscriptEvent,
} from '../application/query/transcript/model.js'

describe('Phase 1 / WP1-E Transcript model', () => {
  test('TRC-001 message_append event passes schema validation', () => {
    const event = createMessageAppendEvent({
      sessionId: 'sess_1',
      traceId: 'trace_1',
      turnId: 'turn_1',
      messageId: 'msg_1',
      role: 'user',
      content: 'hello',
      isToolResult: false,
    })

    const parsed = parseTranscriptEvent(event)
    expect(parsed.ok).toBe(true)
  })

  test('TRC-006 session/trace/turn ids are preserved for alignment', () => {
    const parsed = parseTranscriptEvent({
      ts: '2026-04-09T00:00:00.000Z',
      type: 'message_append',
      session_id: 'sess_align',
      trace_id: 'trace_align',
      turn_id: 'turn_align',
      message_id: 'msg_align',
      role: 'assistant',
      content: [{ type: 'text', text: 'ok' }],
      is_tool_result: false,
    })

    expect(parsed.ok).toBe(true)
    if (!parsed.ok) {
      return
    }

    expect(parsed.event.session_id).toBe('sess_align')
    expect(parsed.event.trace_id).toBe('trace_align')
    expect(parsed.event.turn_id).toBe('turn_align')
  })

  test('rejects malformed message_append payload', () => {
    const parsed = parseTranscriptEvent({
      ts: '2026-04-09T00:00:00.000Z',
      type: 'message_append',
      session_id: 'sess_invalid',
      trace_id: 'trace_invalid',
      role: 'assistant',
      content: [{ type: 'text', text: 'ok' }],
      is_tool_result: false,
    })

    expect(parsed.ok).toBe(false)
    if (parsed.ok) {
      return
    }
    expect(parsed.error).toContain('message_id')
  })
})
