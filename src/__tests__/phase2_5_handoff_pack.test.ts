import { describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REWRITE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

async function readRoadmapFile(relativePath: string): Promise<string> {
  return readFile(resolve(REWRITE_ROOT, relativePath), 'utf8')
}

describe('Phase 2.5 / WP2.5-D Handoff pack completeness', () => {
  test('CTXM-011 TODO Pack includes strategy/risk/case/rollback/dependency fields', async () => {
    const doc = await readRoadmapFile('docs/roadmap/phase-2-5/compression-todo-pack.md')

    expect(doc).toContain('## Entry Criteria')
    expect(doc).toContain('## Strategy Backlog')
    expect(doc).toContain('## Risk Register')
    expect(doc).toContain('## Verification Baseline')
    expect(doc).toContain('## Rollback Plan')
    expect(doc).toContain('## Dependencies')

    expect(doc).toContain('auto')
    expect(doc).toContain('reactive')
    expect(doc).toContain('collapse')
    expect(doc).toContain('overflow')

    expect(doc).toContain('CTXM-001~004')
    expect(doc).toContain('CTXM-005~008')
    expect(doc).toContain('CTXM-009~010')
    expect(doc).toContain('CTXM-011~012')
  })

  test('CTXM-012 Phase Extra README references TODO Pack with consume-before-implement gate', async () => {
    const extraReadme = await readRoadmapFile('docs/roadmap/phase-extra/README.md')

    expect(extraReadme).toContain('../phase-2-5/compression-todo-pack.md')
    expect(extraReadme).toMatch(/先消费.*TODO Pack.*再进入压缩实现/)
  })
})
