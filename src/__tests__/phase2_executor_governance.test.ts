import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { executeTool } from '../tools/executor.js'
import { createStore } from '../state/store.js'
import { getTools } from '../tools/registry.js'
import type { Tool } from '../definitions/types/index.js'

const TOOL_NAME = 'Phase2ExecutorTestTool'

let executeCount = 0

function installTestTool(): void {
  const tool: Tool<{ value?: string }, string> = {
    name: TOOL_NAME,
    description: 'phase2 governance test tool',
    inputSchema: {
      type: 'object',
      properties: {
        value: { type: 'string' },
      },
    },
    async execute(input) {
      executeCount += 1
      return `ok:${input.value ?? 'none'}`
    },
  }
  getTools().register(tool)
}

function setRules(rules: unknown[]): void {
  process.env.PHASE2_PERMISSION_RULES_JSON = JSON.stringify(rules)
}

function restoreEnv(): void {
  delete process.env.PHASE2_PERMISSION_RULES_JSON
  delete process.env.PHASE2_EXECUTOR_GOVERNANCE_ENABLED
  delete process.env.phase2ExecutorGovernanceEnabled
}

function createTestStore(mode: 'auto' | 'ask' | 'plan') {
  return createStore({
    model: 'claude-sonnet-4-20250514',
    permissionMode: mode,
    quiet: true,
    cwd: '/workspace/project',
  })
}

describe('Phase 2 Executor Governance (wip2-04 / WP2-C)', () => {
  beforeEach(() => {
    executeCount = 0
    installTestTool()
    restoreEnv()
  })

  afterEach(() => {
    restoreEnv()
  })

  test('EXE-001 auto + allow: should execute tool directly', async () => {
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
    expect(executeCount).toBe(1)
  })

  test('EXE-002 auto + ask: should deny with approval_required_in_auto', async () => {
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
    expect(result).toContain('approval_required_in_auto')
    expect(executeCount).toBe(0)
  })

  test('EXE-003 ask + ask + approve: should prompt then execute', async () => {
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
    const store = createTestStore('ask')

    const pending = executeTool(TOOL_NAME, { value: 'approve' }, store)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(store.getState().pendingTool?.name).toBe(TOOL_NAME)

    store.getState().resolvePendingTool(true)
    const result = await pending

    expect(result).toBe('ok:approve')
    expect(executeCount).toBe(1)
  })

  test('EXE-004 ask + ask + reject: should return user_denied with permission denied', async () => {
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
    const store = createTestStore('ask')

    const pending = executeTool(TOOL_NAME, { value: 'reject' }, store)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(store.getState().pendingTool?.name).toBe(TOOL_NAME)

    store.getState().resolvePendingTool(false)
    const result = await pending

    expect(result).toContain('permission denied')
    expect(result).toContain('user_denied')
    expect(executeCount).toBe(0)
  })

  test('EXE-005 plan + (allow/ask/deny): should all be blocked by plan_mode_blocked', async () => {
    const actions: Array<'allow' | 'ask' | 'deny'> = ['allow', 'ask', 'deny']
    for (const action of actions) {
      executeCount = 0
      setRules([
        {
          id: `rule-${action}`,
          action,
          source: 'session',
          scope: 'tool',
          toolName: TOOL_NAME,
          riskLevel: 'any',
        },
      ])
      const store = createTestStore('plan')
      const result = await executeTool(TOOL_NAME, { value: action }, store)

      expect(result).toContain('permission denied')
      expect(result).toContain('plan_mode_blocked')
      expect(executeCount).toBe(0)
      expect(store.getState().pendingTool).toBeNull()
    }
  })

  test('EXE-006 governance disabled: should fallback to legacy path', async () => {
    process.env.PHASE2_EXECUTOR_GOVERNANCE_ENABLED = 'false'
    process.env.phase2ExecutorGovernanceEnabled = 'false'
    setRules([
      {
        id: 'deny-tool',
        action: 'deny',
        source: 'session',
        scope: 'tool',
        toolName: TOOL_NAME,
        riskLevel: 'any',
      },
    ])
    const store = createTestStore('plan')

    const result = await executeTool(TOOL_NAME, { value: 'legacy' }, store)

    expect(result).toBe('ok:legacy')
    expect(executeCount).toBe(1)
  })
})
