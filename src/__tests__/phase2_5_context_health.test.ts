import { describe, expect, test } from 'bun:test'
import { buildContextHealthSnapshot } from '../application/query/context-health.js'

describe('Phase 2.5 / WP2.5-A Context health snapshot', () => {
  test('CTXM-001 preflight snapshot outputs context usage and status', () => {
    const result = buildContextHealthSnapshot({
      budget: { maxContextTokens: 100, maxInputTokens: 200, maxOutputTokens: 200 },
      source: 'preflight',
      usage: {
        contextTokens: 80,
        inputTokens: 0,
        outputTokens: 0,
      },
      estimated: {
        contextTokensEstimated: true,
        inputTokensEstimated: true,
        outputTokensEstimated: true,
      },
    })

    expect(result.snapshot.source).toBe('preflight')
    expect(result.snapshot.usage.context).toBe(80)
    expect(result.snapshot.status).toBe('warning')
  })

  test('CTXM-002 streaming and done snapshots share the same schema', () => {
    const streaming = buildContextHealthSnapshot({
      budget: { maxContextTokens: 100, maxInputTokens: 200, maxOutputTokens: 200 },
      source: 'streaming',
      usage: {
        contextTokens: 80,
        inputTokens: 0,
        outputTokens: 24,
      },
      estimated: {
        contextTokensEstimated: true,
        inputTokensEstimated: true,
        outputTokensEstimated: true,
      },
    })

    const done = buildContextHealthSnapshot({
      budget: { maxContextTokens: 100, maxInputTokens: 200, maxOutputTokens: 200 },
      source: 'done',
      usage: {
        contextTokens: 80,
        inputTokens: 40,
        outputTokens: 24,
      },
      estimated: {
        contextTokensEstimated: true,
        inputTokensEstimated: false,
        outputTokensEstimated: false,
      },
    })

    expect(Object.keys(streaming.snapshot.usage)).toEqual(Object.keys(done.snapshot.usage))
    expect(Object.keys(streaming.snapshot.limits)).toEqual(Object.keys(done.snapshot.limits))
    expect(Object.keys(streaming.snapshot.estimated)).toEqual(Object.keys(done.snapshot.estimated))
    expect(streaming.snapshot.source).toBe('streaming')
    expect(done.snapshot.source).toBe('done')
  })

  test('CTXM-003 missing provider usage marks estimated flags on done snapshot', () => {
    const result = buildContextHealthSnapshot({
      budget: { maxContextTokens: 120, maxInputTokens: 120, maxOutputTokens: 120 },
      source: 'done',
      usage: {
        contextTokens: 48,
        inputTokens: 0,
        outputTokens: 16,
      },
      estimated: {
        contextTokensEstimated: true,
        inputTokensEstimated: true,
        outputTokensEstimated: true,
      },
    })

    expect(result.snapshot.estimated.context).toBe(true)
    expect(result.snapshot.estimated.input).toBe(true)
    expect(result.snapshot.estimated.output).toBe(true)
    expect(result.exceeded).toBeNull()
  })

  test('CTXM-004 threshold status is deterministic across repeated runs', () => {
    const statuses = Array.from({ length: 3 }, () => {
      const result = buildContextHealthSnapshot({
        budget: { maxContextTokens: 100, maxInputTokens: 100, maxOutputTokens: 100 },
        source: 'preflight',
        usage: {
          contextTokens: 79,
          inputTokens: 0,
          outputTokens: 0,
        },
        estimated: {
          contextTokensEstimated: true,
          inputTokensEstimated: true,
          outputTokensEstimated: true,
        },
      })

      return result.snapshot.status
    })

    expect(statuses).toEqual(['ok', 'ok', 'ok'])
  })
})
