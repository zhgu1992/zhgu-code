import { describe, expect, test } from 'bun:test'
import type { QueryTurnTransition } from '../architecture/contracts/query-engine.js'
import {
  createTurnStateMachine,
  IllegalTurnTransitionError,
} from '../application/query/turn-state.js'

describe('Phase 1 / WP1-A Turn State Machine', () => {
  test('TSM-001 turn_start: idle -> streaming', () => {
    const machine = createTurnStateMachine()
    const next = machine.transition({ type: 'turn_start', turnId: 'turn_1' })
    expect(next.state).toBe('streaming')
    expect(next.turnId).toBe('turn_1')
  })

  test('TSM-002 tool_use_detected(auto): streaming -> tool-running', () => {
    const machine = createTurnStateMachine()
    machine.transition({ type: 'turn_start', turnId: 'turn_1' })
    const next = machine.transition({ type: 'tool_use_detected', toolMode: 'auto' })
    expect(next.state).toBe('tool-running')
  })

  test('TSM-003 tool_use_detected(ask): streaming -> awaiting-permission', () => {
    const machine = createTurnStateMachine()
    machine.transition({ type: 'turn_start', turnId: 'turn_1' })
    const next = machine.transition({ type: 'tool_use_detected', toolMode: 'ask' })
    expect(next.state).toBe('awaiting-permission')
  })

  test('TSM-004 permission_approved: awaiting-permission -> tool-running', () => {
    const machine = createTurnStateMachine()
    machine.transition({ type: 'turn_start', turnId: 'turn_1' })
    machine.transition({ type: 'tool_use_detected', toolMode: 'ask' })
    const next = machine.transition({ type: 'permission_approved' })
    expect(next.state).toBe('tool-running')
  })

  test('TSM-005 permission_denied: awaiting-permission -> stopped(permission_denied)', () => {
    const machine = createTurnStateMachine()
    machine.transition({ type: 'turn_start', turnId: 'turn_1' })
    machine.transition({ type: 'tool_use_detected', toolMode: 'ask' })
    const next = machine.transition({ type: 'permission_denied' })
    expect(next.state).toBe('stopped')
    expect(next.stopReason).toBe('permission_denied')
  })

  test('TSM-006 tool_result_written: tool-running -> streaming', () => {
    const machine = createTurnStateMachine()
    machine.transition({ type: 'turn_start', turnId: 'turn_1' })
    machine.transition({ type: 'tool_use_detected', toolMode: 'auto' })
    const next = machine.transition({ type: 'tool_result_written' })
    expect(next.state).toBe('streaming')
  })

  test('TSM-007 assistant_done: streaming -> stopped(completed)', () => {
    const machine = createTurnStateMachine()
    machine.transition({ type: 'turn_start', turnId: 'turn_1' })
    const next = machine.transition({ type: 'assistant_done' })
    expect(next.state).toBe('stopped')
    expect(next.stopReason).toBe('completed')
  })

  test('TSM-008 recoverable_error: streaming/tool-running -> recovering', () => {
    const machineA = createTurnStateMachine()
    machineA.transition({ type: 'turn_start', turnId: 'turn_1' })
    const nextA = machineA.transition({ type: 'recoverable_error' })
    expect(nextA.state).toBe('recovering')

    const machineB = createTurnStateMachine()
    machineB.transition({ type: 'turn_start', turnId: 'turn_2' })
    machineB.transition({ type: 'tool_use_detected', toolMode: 'auto' })
    const nextB = machineB.transition({ type: 'recoverable_error' })
    expect(nextB.state).toBe('recovering')
  })

  test('TSM-009 recovery_succeeded: recovering -> streaming', () => {
    const machine = createTurnStateMachine()
    machine.transition({ type: 'turn_start', turnId: 'turn_1' })
    machine.transition({ type: 'recoverable_error' })
    const next = machine.transition({ type: 'recovery_succeeded' })
    expect(next.state).toBe('streaming')
  })

  test('TSM-010 recovery_failed/retry_exhausted: recovering -> stopped(recovery_failed)', () => {
    const machineA = createTurnStateMachine()
    machineA.transition({ type: 'turn_start', turnId: 'turn_1' })
    machineA.transition({ type: 'recoverable_error' })
    const nextA = machineA.transition({ type: 'recovery_failed' })
    expect(nextA.state).toBe('stopped')
    expect(nextA.stopReason).toBe('recovery_failed')

    const machineB = createTurnStateMachine()
    machineB.transition({ type: 'turn_start', turnId: 'turn_2' })
    machineB.transition({ type: 'recoverable_error' })
    const nextB = machineB.transition({ type: 'retry_exhausted' })
    expect(nextB.state).toBe('stopped')
    expect(nextB.stopReason).toBe('recovery_failed')
  })

  test('TSM-011 user_cancelled: any non-terminal -> stopped(cancelled)', () => {
    const machine = createTurnStateMachine()
    machine.transition({ type: 'turn_start', turnId: 'turn_1' })
    const next = machine.transition({ type: 'user_cancelled' })
    expect(next.state).toBe('stopped')
    expect(next.stopReason).toBe('cancelled')
  })

  test('TSM-012 budget_exceeded: any non-terminal -> stopped(budget_exceeded)', () => {
    const machine = createTurnStateMachine()
    machine.transition({ type: 'turn_start', turnId: 'turn_1' })
    const next = machine.transition({ type: 'budget_exceeded' })
    expect(next.state).toBe('stopped')
    expect(next.stopReason).toBe('budget_exceeded')
  })

  test('TSM-013 illegal transition blocked: idle + tool_use_detected', () => {
    const machine = createTurnStateMachine()
    expect(() => machine.transition({ type: 'tool_use_detected', toolMode: 'auto' })).toThrow(
      IllegalTurnTransitionError,
    )
    expect(machine.getSnapshot().state).toBe('idle')
  })

  test('TSM-014 terminal cannot transition: stopped + any event', () => {
    const machine = createTurnStateMachine()
    machine.transition({ type: 'turn_start', turnId: 'turn_1' })
    machine.transition({ type: 'assistant_done' })
    expect(() => machine.transition({ type: 'tool_result_written' })).toThrow(
      IllegalTurnTransitionError,
    )
    expect(machine.getSnapshot().state).toBe('stopped')
  })

  test('TSM-015 single active turn invariant: reject second turn_start', () => {
    const machine = createTurnStateMachine()
    machine.transition({ type: 'turn_start', turnId: 'turn_1' })
    expect(() => machine.transition({ type: 'turn_start', turnId: 'turn_2' })).toThrow(
      IllegalTurnTransitionError,
    )
  })

  test('TSM-016 transition observability: emits from/to/event/reason', () => {
    const transitions: QueryTurnTransition[] = []
    const machine = createTurnStateMachine({
      onTransition: (transition) => transitions.push(transition),
    })

    machine.transition({ type: 'turn_start', turnId: 'turn_1' })
    machine.transition({ type: 'assistant_done' })

    expect(transitions).toEqual([
      {
        turnId: 'turn_1',
        from: 'idle',
        to: 'streaming',
        event: 'turn_start',
      },
      {
        turnId: 'turn_1',
        from: 'streaming',
        to: 'stopped',
        event: 'assistant_done',
        reason: 'completed',
      },
    ])
  })
})
