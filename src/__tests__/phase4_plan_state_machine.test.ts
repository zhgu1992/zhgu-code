import { describe, expect, test } from 'bun:test'
import {
  createPlanStateMachine,
  IllegalPlanTransitionError,
} from '../application/orchestrator/plan-state.js'

describe('Phase 4 / WP4-A Plan state machine', () => {
  test('PLN-001 create plan should start at draft', () => {
    const machine = createPlanStateMachine({ planId: 'plan_1' })
    expect(machine.getSnapshot().state).toBe('draft')
  })

  test('PLN-002 submit approval should move draft -> awaiting-approval', () => {
    const machine = createPlanStateMachine({ planId: 'plan_2' })
    const next = machine.transition({ type: 'submit_for_approval' })
    expect(next.state).toBe('awaiting-approval')
  })

  test('PLN-003 approval granted should move awaiting-approval -> running', () => {
    const machine = createPlanStateMachine({ planId: 'plan_3' })
    machine.transition({ type: 'submit_for_approval' })
    const next = machine.transition({ type: 'approval_granted' })
    expect(next.state).toBe('running')
  })

  test('PLN-004 approval rejected should move awaiting-approval -> failed(permission_denied)', () => {
    const machine = createPlanStateMachine({ planId: 'plan_4' })
    machine.transition({ type: 'submit_for_approval' })
    const next = machine.transition({ type: 'approval_rejected' })
    expect(next.state).toBe('failed')
    expect(next.terminalReason).toBe('permission_denied')
  })

  test('PLN-005 cancel while running should move running -> cancelled', () => {
    const machine = createPlanStateMachine({ planId: 'plan_5' })
    machine.transition({ type: 'submit_for_approval' })
    machine.transition({ type: 'approval_granted' })
    const next = machine.transition({ type: 'cancel' })
    expect(next.state).toBe('cancelled')
    expect(next.terminalReason).toBe('user_cancelled')
  })

  test('PLN-006 terminal state should reject further transitions', () => {
    const machine = createPlanStateMachine({ planId: 'plan_6' })
    machine.transition({ type: 'submit_for_approval' })
    machine.transition({ type: 'approval_rejected' })

    expect(() => machine.transition({ type: 'approval_granted' })).toThrow(
      IllegalPlanTransitionError,
    )
    expect(machine.getSnapshot().state).toBe('failed')
  })
})
