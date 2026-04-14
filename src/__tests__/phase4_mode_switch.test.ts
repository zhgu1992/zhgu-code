import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { createStore } from '../state/store.js'
import { executeModeCommand } from '../core/commands/mode-command.js'
import { executeTool } from '../tools/executor.js'
import { getTools } from '../tools/registry.js'
import type { Tool } from '../definitions/types/index.js'

const TEST_TOOL = 'Phase4ModeSwitchTool'
let executeCount = 0

function createTestStore(mode: 'auto' | 'ask' | 'plan' = 'auto') {
  return createStore({
    model: 'claude-sonnet-4-20250514',
    permissionMode: mode,
    quiet: true,
    cwd: '/workspace/project',
  })
}

function installTestTool(): void {
  const tool: Tool<{ value?: string }, string> = {
    name: TEST_TOOL,
    description: 'phase4 mode switch test tool',
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
  getTools().register(tool as Tool)
}

function restoreEnv(): void {
  delete process.env.PHASE2_PERMISSION_RULES_JSON
  delete process.env.PHASE2_EXECUTOR_GOVERNANCE_ENABLED
  delete process.env.phase2ExecutorGovernanceEnabled
}

describe('Phase 4 A0: mode switch local command', () => {
  beforeEach(() => {
    executeCount = 0
    installTestTool()
    restoreEnv()
  })

  afterEach(() => {
    restoreEnv()
  })

  test('A0-001 /plan should switch permission mode to plan', () => {
    const store = createTestStore('auto')

    const result = executeModeCommand(store, '/plan')

    expect(result.handled).toBe(true)
    expect(result.switched).toBe(true)
    expect(store.getState().permissionMode).toBe('plan')
  })

  test('A0-002 /implement should default to ask', () => {
    const store = createTestStore('plan')

    const result = executeModeCommand(store, '/implement')

    expect(result.handled).toBe(true)
    expect(result.switched).toBe(true)
    expect(store.getState().permissionMode).toBe('ask')
  })

  test('A0-003 /mode auto should switch permission mode to auto', () => {
    const store = createTestStore('ask')

    const result = executeModeCommand(store, '/mode auto')

    expect(result.handled).toBe(true)
    expect(result.switched).toBe(true)
    expect(store.getState().permissionMode).toBe('auto')
  })

  test('A0-003b /auto should switch permission mode to auto', () => {
    const store = createTestStore('ask')

    const result = executeModeCommand(store, '/auto')

    expect(result.handled).toBe(true)
    expect(result.switched).toBe(true)
    expect(store.getState().permissionMode).toBe('auto')
  })

  test('A0-003c /ask should switch permission mode to ask', () => {
    const store = createTestStore('plan')

    const result = executeModeCommand(store, '/ask')

    expect(result.handled).toBe(true)
    expect(result.switched).toBe(true)
    expect(store.getState().permissionMode).toBe('ask')
  })

  test('A0-004 invalid mode should keep state unchanged and return error', () => {
    const store = createTestStore('ask')

    const result = executeModeCommand(store, '/mode foo')

    expect(result.handled).toBe(true)
    expect(result.switched).toBe(false)
    expect(result.message).toContain('Invalid mode')
    expect(store.getState().permissionMode).toBe('ask')
  })

  test('A0-005 plan mode should still block tool execution with plan_mode_blocked', async () => {
    process.env.PHASE2_PERMISSION_RULES_JSON = JSON.stringify([
      {
        id: 'allow-test-tool',
        action: 'allow',
        source: 'session',
        scope: 'tool',
        toolName: TEST_TOOL,
        riskLevel: 'any',
      },
    ])
    const store = createTestStore('auto')
    executeModeCommand(store, '/plan')

    const result = await executeTool(TEST_TOOL, { value: 'blocked' }, store)

    expect(result).toContain('permission denied')
    expect(result).toContain('plan_mode_blocked')
    expect(executeCount).toBe(0)
  })

  test('A0-006 local command should not trigger query turn', () => {
    const store = createTestStore('auto')

    const result = executeModeCommand(store, '/plan')

    expect(result.handled).toBe(true)
    expect(store.getState().turnState).toBe('idle')
    expect(store.getState().currentTurnId).toBeNull()
    expect(store.getState().messages).toHaveLength(0)
  })
})
