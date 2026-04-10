import { createHash } from 'node:crypto'
import { describe, expect, test } from 'bun:test'
import type { Context } from '../core/context.js'
import { buildSystemPrompt } from '../core/prompt.js'

function buildContext(overrides: Partial<Context> = {}): Context {
  return {
    cwd: '/repo/workspace',
    gitBranch: 'main',
    gitStatus: ' M src/core/prompt.ts',
    claudeMd: 'Project rules go here.',
    memoryFiles: ['Remember to keep tests deterministic.'],
    systemInfo: {
      platform: 'darwin',
      nodeVersion: 'v22.0.0',
      date: '2026-04-10T10:00:00.000Z',
    },
    ...overrides,
  }
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

describe('Phase 2.5 / WP2.5-E Prompt cache prefix strategy', () => {
  test('CTXM-013 stable prefix hash remains unchanged across turns', () => {
    const firstTurn = buildSystemPrompt(buildContext())
    const secondTurn = buildSystemPrompt(
      buildContext({
        cwd: '/repo/workspace-next',
        systemInfo: {
          platform: 'darwin',
          nodeVersion: 'v22.0.0',
          date: '2026-04-10T10:05:00.000Z',
        },
      }),
    )

    expect(Array.isArray(firstTurn.system)).toBe(true)
    expect(Array.isArray(secondTurn.system)).toBe(true)

    const firstPrefix = (firstTurn.system as { text: string }[])
      .slice(0, 2)
      .map((block) => block.text)
      .join('\n\n')
    const secondPrefix = (secondTurn.system as { text: string }[])
      .slice(0, 2)
      .map((block) => block.text)
      .join('\n\n')

    expect(sha256(firstPrefix)).toBe(sha256(secondPrefix))
  })

  test('CTXM-014 dynamic runtime fields are isolated in suffix block', () => {
    const context = buildContext({
      cwd: '/repo/turn-2',
      gitBranch: 'feature/cache-prefix',
      systemInfo: {
        platform: 'darwin',
        nodeVersion: 'v22.0.0',
        date: '2026-04-10T10:15:00.000Z',
      },
    })

    const prompt = buildSystemPrompt(context)
    expect(Array.isArray(prompt.system)).toBe(true)

    const blocks = prompt.system as Array<{
      text: string
      cache_control?: { type: 'ephemeral' }
    }>
    const prefix = blocks
      .slice(0, 2)
      .map((block) => block.text)
      .join('\n\n')
    const suffix = blocks[2]?.text ?? ''

    expect(prefix).not.toContain(context.systemInfo.date)
    expect(prefix).not.toContain(context.cwd)
    expect(prefix).not.toContain(context.gitBranch!)
    expect(suffix).toContain(context.systemInfo.date)
    expect(suffix).toContain(context.cwd)
    expect(suffix).toContain(context.gitBranch!)
    expect(blocks[0]?.cache_control?.type).toBe('ephemeral')
    expect(blocks[1]?.cache_control?.type).toBe('ephemeral')
    expect(blocks[2]?.cache_control).toBeUndefined()
  })

  test('CTXM-015 disabling strategy falls back to legacy single string prompt', () => {
    const prompt = buildSystemPrompt(buildContext(), {
      enableCachePrefixStrategy: false,
    })

    expect(typeof prompt.system).toBe('string')
    expect(prompt.system).toBe(prompt.legacy)
    expect(prompt.legacy).toContain('Current date:')
    expect(prompt.legacy).toContain('Working directory:')
  })
})
