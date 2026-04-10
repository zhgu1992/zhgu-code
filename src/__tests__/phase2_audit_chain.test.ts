import { mkdtemp, mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { createStore } from '../state/store.js'
import type { Tool } from '../definitions/types/index.js'
import { executeTool } from '../tools/executor.js'
import { getTools } from '../tools/registry.js'
import { getTraceBus } from '../observability/trace-bus.js'
import type { AuditExecutionFinishedEvent } from '../application/query/audit/model.js'
import { parseAuditJsonl, replayAuditRequest } from '../application/query/audit/reader.js'
import { flushAuditWriter, resetAuditWriterForTests } from '../application/query/audit/runtime.js'

const TOOL_NAME = 'Phase2AuditTool'
const FAIL_TOOL_NAME = 'Phase2AuditFailTool'

function installTools(): void {
  const successTool: Tool<{ value?: string }, string> = {
    name: TOOL_NAME,
    description: 'phase2 audit test tool',
    inputSchema: {
      type: 'object',
      properties: {
        value: { type: 'string' },
      },
    },
    async execute(input) {
      return `ok:${input.value ?? 'none'}`
    },
  }

  const failTool: Tool<{ value?: string }, string> = {
    name: FAIL_TOOL_NAME,
    description: 'phase2 audit fail test tool',
    inputSchema: {
      type: 'object',
      properties: {
        value: { type: 'string' },
      },
    },
    async execute() {
      throw new Error('boom')
    },
  }

  getTools().register(successTool as Tool)
  getTools().register(failTool as Tool)
}

function setRules(rules: unknown[]): void {
  process.env.PHASE2_PERMISSION_RULES_JSON = JSON.stringify(rules)
}

function createTestStore(mode: 'auto' | 'ask' | 'plan') {
  return createStore({
    model: 'claude-sonnet-4-20250514',
    permissionMode: mode,
    quiet: true,
    cwd: '/workspace/project',
  })
}

function restoreEnv(): void {
  delete process.env.PHASE2_PERMISSION_RULES_JSON
  delete process.env.PHASE2_EXECUTOR_GOVERNANCE_ENABLED
  delete process.env.phase2ExecutorGovernanceEnabled
  delete process.env.ZHGU_AUDIT_FILE
}

async function createTempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix))
}

describe('Phase 2 Audit Chain (wip2-05 / WP2-D)', () => {
  beforeEach(() => {
    installTools()
    restoreEnv()
    resetAuditWriterForTests()
  })

  afterEach(async () => {
    await flushAuditWriter()
    resetAuditWriterForTests()
    restoreEnv()
  })

  test('AUD-001 allow flow should persist full request->decision->start->finish(success)', async () => {
    const dir = await createTempDir('wp2d-aud-001-')
    const outputPath = join(dir, 'audit.jsonl')
    process.env.ZHGU_AUDIT_FILE = outputPath
    setRules([
      {
        id: 'allow-tool',
        action: 'allow',
        source: 'session',
        scope: 'tool',
        toolName: TOOL_NAME,
        riskLevel: 'any',
      },
    ])
    const store = createTestStore('auto')

    const result = await executeTool(TOOL_NAME, { value: 'pass' }, store)
    expect(result).toBe('ok:pass')

    await flushAuditWriter()
    const parsed = parseAuditJsonl(await readFile(outputPath, 'utf8'))
    expect(parsed.issues).toEqual([])

    const requested = parsed.events.find(
      (event) => event.type === 'audit.requested' && event.tool_name === TOOL_NAME,
    )
    expect(requested).toBeDefined()
    const replay = replayAuditRequest(parsed.events, requested!.request_id)
    expect(replay).not.toBeNull()
    expect(replay!.steps.map((event) => event.type)).toEqual([
      'audit.requested',
      'audit.permission_decided',
      'audit.execution_started',
      'audit.execution_finished',
    ])
    expect(replay!.summary.success).toBe(true)
    expect(replay!.summary.permissionAction).toBe('allow')
    expect(replay!.summary.riskLevel).toBeDefined()
  })

  test('AUD-002 deny flow should persist request->decision->finish(denied) with reason', async () => {
    const dir = await createTempDir('wp2d-aud-002-')
    const outputPath = join(dir, 'audit.jsonl')
    process.env.ZHGU_AUDIT_FILE = outputPath
    setRules([
      {
        id: 'ask-tool',
        action: 'ask',
        source: 'session',
        scope: 'tool',
        toolName: TOOL_NAME,
        riskLevel: 'any',
      },
    ])
    const store = createTestStore('auto')

    const result = await executeTool(TOOL_NAME, { value: 'deny' }, store)
    expect(result).toContain('permission denied')

    await flushAuditWriter()
    const parsed = parseAuditJsonl(await readFile(outputPath, 'utf8'))
    expect(parsed.issues).toEqual([])

    const requested = parsed.events.find(
      (event) => event.type === 'audit.requested' && event.tool_name === TOOL_NAME,
    )
    expect(requested).toBeDefined()
    const replay = replayAuditRequest(parsed.events, requested!.request_id)
    expect(replay).not.toBeNull()
    expect(replay!.steps.map((event) => event.type)).toEqual([
      'audit.requested',
      'audit.permission_decided',
      'audit.execution_finished',
    ])
    expect(replay!.summary.success).toBe(false)
    expect(replay!.summary.reasonCode).toBe('approval_required_in_auto')
  })

  test('AUD-003 execution error should still persist execution_finished(success=false)', async () => {
    const dir = await createTempDir('wp2d-aud-003-')
    const outputPath = join(dir, 'audit.jsonl')
    process.env.ZHGU_AUDIT_FILE = outputPath
    setRules([
      {
        id: 'allow-tool',
        action: 'allow',
        source: 'session',
        scope: 'tool',
        toolName: FAIL_TOOL_NAME,
        riskLevel: 'any',
      },
    ])
    const store = createTestStore('auto')

    const result = await executeTool(FAIL_TOOL_NAME, {}, store)
    expect(result).toContain('Error: boom')

    await flushAuditWriter()
    const parsed = parseAuditJsonl(await readFile(outputPath, 'utf8'))
    expect(parsed.issues).toEqual([])

    const requested = parsed.events.find(
      (event) => event.type === 'audit.requested' && event.tool_name === FAIL_TOOL_NAME,
    )
    expect(requested).toBeDefined()
    const replay = replayAuditRequest(parsed.events, requested!.request_id)
    expect(replay).not.toBeNull()
    expect(replay!.steps.map((event) => event.type)).toEqual([
      'audit.requested',
      'audit.permission_decided',
      'audit.execution_started',
      'audit.execution_finished',
    ])
    const finished = replay!.steps.find(
      (event): event is AuditExecutionFinishedEvent => event.type === 'audit.execution_finished',
    )
    expect(finished).toBeDefined()
    expect(finished?.success).toBe(false)
    expect(finished?.result).toBe('error')
    expect(finished?.error_message).toContain('boom')
  })

  test('AUD-004 write failure should not block tool execution and emits trace downgrade event', async () => {
    const dir = await createTempDir('wp2d-aud-004-')
    process.env.ZHGU_AUDIT_FILE = join(dir, 'not-a-file')
    await mkdir(process.env.ZHGU_AUDIT_FILE, { recursive: true })

    setRules([
      {
        id: 'allow-tool',
        action: 'allow',
        source: 'session',
        scope: 'tool',
        toolName: TOOL_NAME,
        riskLevel: 'any',
      },
    ])
    const traceEvents: Array<{ stage: string; event: string }> = []
    getTraceBus().addSink({
      write(event) {
        traceEvents.push({ stage: event.stage, event: event.event })
      },
    })
    const store = createTestStore('auto')

    const result = await executeTool(TOOL_NAME, { value: 'still-pass' }, store)
    expect(result).toBe('ok:still-pass')

    await flushAuditWriter()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(
      traceEvents.some((event) => event.stage === 'tool' && event.event === 'audit_write_failed'),
    ).toBe(true)
  })

  test('AUD-005 replay should rebuild stable summary by requestId', async () => {
    const dir = await createTempDir('wp2d-aud-005-')
    const outputPath = join(dir, 'audit.jsonl')
    process.env.ZHGU_AUDIT_FILE = outputPath
    setRules([
      {
        id: 'allow-tool',
        action: 'allow',
        source: 'session',
        scope: 'tool',
        toolName: TOOL_NAME,
        riskLevel: 'any',
      },
    ])
    const store = createTestStore('auto')
    await executeTool(TOOL_NAME, { value: 'replay' }, store)

    await flushAuditWriter()
    const parsed = parseAuditJsonl(await readFile(outputPath, 'utf8'))
    const requested = parsed.events.find(
      (event) => event.type === 'audit.requested' && event.tool_name === TOOL_NAME,
    )
    expect(requested).toBeDefined()

    const replay = replayAuditRequest(parsed.events, requested!.request_id)
    expect(replay).not.toBeNull()
    expect(replay!.partial).toBe(false)
    expect(replay!.gaps).toEqual([])
    expect(replay!.summary.requestId).toBe(requested!.request_id)
    expect(replay!.summary.toolName).toBe(TOOL_NAME)
    expect(replay!.summary.startedAt).toBeDefined()
    expect(replay!.summary.endedAt).toBeDefined()
    expect(replay!.summary.success).toBe(true)
    const seqs = replay!.steps.map((event) => event.seq)
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b))
  })
})
