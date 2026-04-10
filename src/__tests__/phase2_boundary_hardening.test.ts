import { mkdtemp, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { createStore } from '../state/store.js'
import { executeTool } from '../tools/executor.js'
import { getTraceBus } from '../observability/trace-bus.js'
import { parseAuditJsonl, replayAuditRequest } from '../application/query/audit/reader.js'
import { flushAuditWriter, resetAuditWriterForTests } from '../application/query/audit/runtime.js'

function createTestStore(mode: 'auto' | 'ask' | 'plan' = 'auto') {
  return createStore({
    model: 'claude-sonnet-4-20250514',
    permissionMode: mode,
    quiet: true,
    cwd: '/workspace/project',
  })
}

function setAllowRule(toolName: string): void {
  process.env.PHASE2_PERMISSION_RULES_JSON = JSON.stringify([
    {
      id: `allow-${toolName.toLowerCase()}`,
      action: 'allow',
      source: 'session',
      scope: 'tool',
      toolName,
      riskLevel: 'any',
    },
  ])
}

function restoreEnv(): void {
  delete process.env.PHASE2_PERMISSION_RULES_JSON
  delete process.env.PHASE2_EXECUTOR_GOVERNANCE_ENABLED
  delete process.env.phase2ExecutorGovernanceEnabled
  delete process.env.PHASE2_BOUNDARY_HARDENING_ENABLED
  delete process.env.phase2BoundaryHardeningEnabled
  delete process.env.PHASE2_BOUNDARY_ENFORCEMENT
  delete process.env.phase2BoundaryEnforcement
  delete process.env.ZHGU_AUDIT_FILE
}

describe('Phase 2 Boundary Hardening (wip2-06 / WP2-E)', () => {
  beforeEach(() => {
    restoreEnv()
    resetAuditWriterForTests()
  })

  afterEach(async () => {
    await flushAuditWriter()
    resetAuditWriterForTests()
    restoreEnv()
  })

  test('HARD-001 Write outside workspace is denied with file_outside_workspace', async () => {
    setAllowRule('Write')
    const store = createTestStore('auto')

    const result = await executeTool(
      'Write',
      { file_path: '/tmp/wp2e-hard-001.txt', content: 'blocked' },
      store,
    )

    expect(result).toContain('permission denied')
    expect(result).toContain('file_outside_workspace')
  })

  test('HARD-002 Edit sensitive path is denied with file_sensitive_path', async () => {
    setAllowRule('Edit')
    const store = createTestStore('auto')

    const result = await executeTool(
      'Edit',
      { file_path: '/etc/hosts', old_string: 'a', new_string: 'b' },
      store,
    )

    expect(result).toContain('permission denied')
    expect(result).toContain('file_sensitive_path')
  })

  test('HARD-003 Bash destructive command is denied with shell_destructive_pattern', async () => {
    setAllowRule('Bash')
    const store = createTestStore('auto')

    const result = await executeTool('Bash', { command: 'rm -rf /tmp/wp2e-hard-003' }, store)

    expect(result).toContain('permission denied')
    expect(result).toContain('shell_destructive_pattern')
  })

  test('HARD-004 Bash safe command is not blocked', async () => {
    setAllowRule('Bash')
    const store = createTestStore('auto')

    const result = await executeTool('Bash', { command: 'echo hello-hard-004' }, store)
    expect(result).toContain('hello-hard-004')
    expect(result).not.toContain('permission denied')
  })

  test('HARD-005 WebFetch untrusted protocol is denied with network_untrusted_protocol', async () => {
    setAllowRule('WebFetch')
    const store = createTestStore('auto')

    const result = await executeTool(
      'WebFetch',
      { url: 'ftp://example.com/file', prompt: 'x' },
      store,
    )

    expect(result).toContain('permission denied')
    expect(result).toContain('network_untrusted_protocol')
  })

  test('HARD-006 WebFetch private/metadata target is denied with network_private_target', async () => {
    setAllowRule('WebFetch')
    const store = createTestStore('auto')

    const result = await executeTool(
      'WebFetch',
      { url: 'http://169.254.169.254/latest/meta-data', prompt: 'x' },
      store,
    )

    expect(result).toContain('permission denied')
    expect(result).toContain('network_private_target')
  })

  test('HARD-007 boundary deny is persisted into trace/audit with stable reason', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'wp2e-hard-007-'))
    process.env.ZHGU_AUDIT_FILE = join(dir, 'audit.jsonl')
    setAllowRule('Write')

    const traceEvents: Array<{ stage: string; event: string; payload?: unknown }> = []
    getTraceBus().addSink({
      write(event) {
        traceEvents.push({ stage: event.stage, event: event.event, payload: event.payload })
      },
    })
    const store = createTestStore('auto')

    const result = await executeTool(
      'Write',
      { file_path: '/tmp/wp2e-hard-007.txt', content: 'x' },
      store,
    )
    expect(result).toContain('permission denied')
    expect(result).toContain('file_outside_workspace')

    await flushAuditWriter()
    const parsed = parseAuditJsonl(await readFile(process.env.ZHGU_AUDIT_FILE!, 'utf8'))
    expect(parsed.issues).toEqual([])
    const requested = parsed.events.find(
      (event) => event.type === 'audit.requested' && event.tool_name === 'Write',
    )
    expect(requested).toBeDefined()
    const replay = replayAuditRequest(parsed.events, requested!.request_id)
    expect(replay).not.toBeNull()
    expect(replay!.summary.reasonCode).toBe('file_outside_workspace')
    expect(replay!.summary.boundaryBlocked).toBe(true)
    expect(replay!.summary.boundaryReasonCode).toBe('file_outside_workspace')

    const boundaryEvent = traceEvents.find(
      (event) => event.stage === 'permission' && event.event === 'boundary_gate',
    )
    expect(boundaryEvent).toBeDefined()
    const payload = boundaryEvent?.payload as
      | { boundaryBlocked?: boolean; boundaryReasonCode?: string }
      | undefined
    expect(payload?.boundaryBlocked).toBe(true)
    expect(payload?.boundaryReasonCode).toBe('file_outside_workspace')
  })

  test('HARD-008 disable hardening switch falls back to WP2-C/WP2-D behavior', async () => {
    process.env.PHASE2_BOUNDARY_HARDENING_ENABLED = 'false'
    process.env.phase2BoundaryHardeningEnabled = 'false'
    setAllowRule('Write')
    const store = createTestStore('auto')
    const outsidePath = `/tmp/wp2e-hard-008-${Date.now()}.txt`

    const result = await executeTool(
      'Write',
      { file_path: outsidePath, content: 'fallback' },
      store,
    )

    expect(result).toContain('Successfully wrote')
    expect(result).not.toContain('permission denied')
  })
})
