import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { createStore } from '../state/store.js'
import { executeModeCommand } from '../core/commands/mode-command.js'
import { executeToolAndPersist } from '../application/query/tool-orchestrator.js'
import { createTurnStateMachine } from '../application/query/turn-state.js'
import { getTools } from '../tools/registry.js'
import type { Tool } from '../definitions/types/index.js'
import { getTraceBus } from '../observability/trace-bus.js'

const TEST_TOOL = 'Phase45ApprovalRuntimeTool'
let executeCount = 0

function createTestStore(mode: 'auto' | 'ask' | 'plan' = 'ask') {
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
    description: 'phase4.5 approval runtime test tool',
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

describe('Phase 4.5 / P45-S03 Approval runtime wiring', () => {
  beforeEach(() => {
    executeCount = 0
    installTestTool()
    getTraceBus().clearSinks()
  })

  afterEach(() => {
    delete process.env.PHASE2_PERMISSION_RULES_JSON
    delete process.env.PHASE2_EXECUTOR_GOVERNANCE_ENABLED
    delete process.env.phase2ExecutorGovernanceEnabled
    getTraceBus().clearSinks()
  })

  test('P45-S03-001 /submit should create active plan and move draft -> awaiting-approval', () => {
    const store = createTestStore('plan')

    const result = executeModeCommand(store, '/submit')

    expect(result.handled).toBe(true)
    expect(result.switched).toBe(false)
    expect(store.getState().orchestratorRuntimeSession.activePlan?.state).toBe('awaiting-approval')
    expect(store.getState().orchestratorRuntimeSession.activePlan?.planApprovalStatus).toBe(
      'pending',
    )
  })

  test('P45-S03-002 /approve should move awaiting-approval -> running and mark approved', () => {
    const store = createTestStore('plan')
    executeModeCommand(store, '/submit')

    const result = executeModeCommand(store, '/approve')

    expect(result.handled).toBe(true)
    expect(result.switched).toBe(false)
    expect(store.getState().orchestratorRuntimeSession.activePlan?.state).toBe('running')
    expect(store.getState().orchestratorRuntimeSession.activePlan?.planApprovalStatus).toBe(
      'approved',
    )
  })

  test('P45-S03-003 /reject should fail active plan and block tool with permission_denied', async () => {
    const store = createTestStore('plan')
    executeModeCommand(store, '/submit')

    const reject = executeModeCommand(store, '/reject')

    expect(reject.handled).toBe(true)
    expect(store.getState().orchestratorRuntimeSession.activePlan?.state).toBe('failed')
    expect(store.getState().orchestratorRuntimeSession.activePlan?.terminalReason).toBe(
      'permission_denied',
    )
    expect(store.getState().orchestratorRuntimeSession.activePlan?.planApprovalStatus).toBe(
      'rejected',
    )

    const turnStateMachine = createTurnStateMachine()
    const outcome = await executeToolAndPersist({
      store,
      call: {
        id: 'task_rejected_1',
        name: TEST_TOOL,
        input: { value: 'blocked' },
      },
      orchestratorContext: {
        planId: store.getState().orchestratorRuntimeSession.activePlan!.planId,
        taskId: 'task_rejected_1',
      },
      assistantContent: [],
      turnStateMachine,
      recoveryBudget: {
        currentTotalAttempt: () => 0,
        incrementTotalAttempt: () => undefined,
        maxTotalAttempts: 2,
      },
    })

    expect(outcome).toBe('stopped')
    expect(store.getState().error).toContain('permission denied')
    expect(store.getState().error).toContain('permission_denied')
    expect(executeCount).toBe(0)
  })

  test('P45-S04-001 permission drift should downgrade mode to ask and keep tool execution callable', async () => {
    const store = createTestStore('auto')
    store.getState().setActivePlanContext({
      planId: 'plan_drift_1',
      planMode: 'ask',
      state: 'running',
      planApprovalStatus: 'approved',
    })

    const traceEvents: Array<{ event: string; payload?: unknown }> = []
    getTraceBus().addSink({
      write(event) {
        traceEvents.push({ event: event.event, payload: event.payload })
      },
    })

    const turnStateMachine = createTurnStateMachine()
    turnStateMachine.transition({ type: 'turn_start', turnId: 'turn_drift_1' })
    turnStateMachine.transition({ type: 'tool_use_detected', toolMode: 'auto' })
    const outcome = await executeToolAndPersist({
      store,
      call: {
        id: 'task_drift_1',
        name: TEST_TOOL,
        input: { value: 'drift' },
      },
      orchestratorContext: {
        planId: 'plan_drift_1',
        taskId: 'task_drift_1',
      },
      assistantContent: [],
      turnStateMachine,
      recoveryBudget: {
        currentTotalAttempt: () => 0,
        incrementTotalAttempt: () => undefined,
        maxTotalAttempts: 2,
      },
    })

    for (let i = 0; i < 20; i += 1) {
      if (traceEvents.some((event) => event.event === 'orchestrator_permission_drift_guard')) {
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 1))
    }

    expect(outcome).toBe('handoff')
    expect(store.getState().permissionMode).toBe('ask')
    expect(store.getState().error).toBeNull()
    expect(executeCount).toBe(1)

    const driftGuard = traceEvents.find((event) => event.event === 'orchestrator_permission_drift_guard')
    expect(driftGuard).toBeDefined()
    const payload = driftGuard?.payload as
      | { reasonCode?: string; eventSeq?: number; downgradedToMode?: string; source?: string }
      | undefined
    expect(payload?.reasonCode).toBe('permission_drift_detected')
    expect(payload?.eventSeq).toBe(2)
    expect(payload?.downgradedToMode).toBe('ask')
    expect(payload?.source).toBe('task')
  })
})
