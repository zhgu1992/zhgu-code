import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { buildContextView, loadLatestContextSnapshotFromTrace } from '../application/query/context-view.js'

const tempDirs: string[] = []

describe('Phase 2.5 / WP2.5-C Context view alignment', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0, tempDirs.length).map((dir) => rm(dir, { recursive: true, force: true })),
    )
  })

  test('CTXM-009 context view maps query snapshot fields without extra derived fields', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ctxm-009-'))
    tempDirs.push(dir)
    const tracePath = join(dir, 'trace.jsonl')

    const traceLines = [
      JSON.stringify({
        ts: '2026-04-10T10:00:00.000Z',
        stage: 'query',
        event: 'context_health_snapshot',
        status: 'info',
        session_id: 'sess_009',
        trace_id: 'trace_009',
        span_id: 'span_009',
        payload: {
          status: 'warning',
          source: 'streaming',
          usage: { context: 80, input: 12, output: 20 },
          limits: { maxContext: 100, maxInput: 200, maxOutput: 300 },
          estimated: { context: true, input: false, output: false },
        },
      }),
    ]

    await writeFile(tracePath, `${traceLines.join('\n')}\n`, 'utf8')

    const record = await loadLatestContextSnapshotFromTrace(tracePath)
    const view = buildContextView(record)

    expect(view).toEqual({
      type: 'snapshot',
      status: 'warning',
      source: 'streaming',
      usage: { context: 80, input: 12, output: 20 },
      limits: { maxContext: 100, maxInput: 200, maxOutput: 300 },
      estimated: { context: true, input: false, output: false },
      updatedAt: '2026-04-10T10:00:00.000Z',
    })
    expect(Object.keys(view)).toEqual([
      'type',
      'status',
      'source',
      'usage',
      'limits',
      'estimated',
      'updatedAt',
    ])
  })

  test('CTXM-010 no snapshot returns structured no_data response', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ctxm-010-'))
    tempDirs.push(dir)
    const tracePath = join(dir, 'trace.jsonl')
    await writeFile(
      tracePath,
      `${JSON.stringify({
        ts: '2026-04-10T10:05:00.000Z',
        stage: 'query',
        event: 'execute_start',
        status: 'start',
        session_id: 'sess_010',
        trace_id: 'trace_010',
        span_id: 'span_010',
      })}\n`,
      'utf8',
    )

    const record = await loadLatestContextSnapshotFromTrace(tracePath)
    const view = buildContextView(record)

    expect(record).toBeNull()
    expect(view.type).toBe('no_data')
    expect(view).toMatchObject({
      type: 'no_data',
      reason: 'query_snapshot_unavailable',
    })
  })
})
