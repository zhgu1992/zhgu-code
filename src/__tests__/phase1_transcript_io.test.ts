import { mkdtemp, mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, test } from 'bun:test'
import { parseTranscriptJsonl } from '../application/query/transcript/reader.js'
import { JsonlTranscriptWriter } from '../application/query/transcript/writer.js'

async function createTempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix))
}

describe('Phase 1 / WP1-E Transcript IO', () => {
  test('TRC-001/TRC-002 writes visible messages and tool chain records into JSONL', async () => {
    const dir = await createTempDir('wp1e-io-')
    const outputPath = join(dir, 'transcript.jsonl')
    const writer = new JsonlTranscriptWriter({ outputPath })

    writer.recordSessionStart({
      sessionId: 'sess_io',
      traceId: 'trace_io',
      model: 'claude-sonnet-4-6',
      cwd: '/tmp/workspace',
    })
    writer.recordMessageAppend({
      sessionId: 'sess_io',
      traceId: 'trace_io',
      turnId: 'turn_1',
      messageId: 'msg_user_1',
      role: 'user',
      content: 'read README',
    })
    writer.recordMessageAppend({
      sessionId: 'sess_io',
      traceId: 'trace_io',
      turnId: 'turn_1',
      messageId: 'msg_tool_use_1',
      role: 'assistant',
      content: [{ type: 'tool_use', id: 'tool_1', name: 'Read', input: { file_path: 'README.md' } }],
      isToolResult: true,
    })
    writer.recordMessageAppend({
      sessionId: 'sess_io',
      traceId: 'trace_io',
      turnId: 'turn_1',
      messageId: 'msg_tool_result_1',
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'tool_1', content: 'ok' }],
      isToolResult: true,
    })
    writer.recordMessageAppend({
      sessionId: 'sess_io',
      traceId: 'trace_io',
      turnId: 'turn_1',
      messageId: 'msg_assistant_1',
      role: 'assistant',
      content: [{ type: 'text', text: 'done' }],
    })
    await writer.flush()

    const raw = await readFile(outputPath, 'utf8')
    const parsed = parseTranscriptJsonl(raw)

    expect(parsed.issues).toEqual([])
    expect(parsed.events.length).toBe(5)

    const messageEvents = parsed.events.filter((event) => event.type === 'message_append')
    expect(messageEvents.length).toBe(4)
    expect(messageEvents[0]?.role).toBe('user')
    expect(messageEvents[0]?.is_tool_result).toBe(false)
    expect(messageEvents[1]?.is_tool_result).toBe(true)
  })

  test('TRC-005 write failures are observable and non-blocking', async () => {
    const dir = await createTempDir('wp1e-io-fail-')
    const outputPath = join(dir, 'not-a-file')
    await mkdir(outputPath, { recursive: true })

    const errors: string[] = []
    const writer = new JsonlTranscriptWriter({
      outputPath,
      onError: (error) => {
        errors.push(error instanceof Error ? error.message : String(error))
      },
    })

    writer.recordSessionStart({
      sessionId: 'sess_fail',
      traceId: 'trace_fail',
      model: 'claude-sonnet-4-6',
      cwd: '/tmp/workspace',
    })
    writer.recordMessageAppend({
      sessionId: 'sess_fail',
      traceId: 'trace_fail',
      turnId: 'turn_fail',
      messageId: 'msg_fail',
      role: 'user',
      content: 'hello',
    })

    await writer.flush()
    expect(errors.length).toBeGreaterThan(0)
  })
})
