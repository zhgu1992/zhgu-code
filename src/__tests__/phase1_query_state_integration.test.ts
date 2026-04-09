import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { createStore } from '../state/store.js'
import { createTurnStateMachine } from '../application/query/turn-state.js'
import { getTraceBus } from '../observability/trace-bus.js'
import type { TraceEvent, TraceSink } from '../observability/trace-model.js'

const traceEvents: TraceEvent[] = []

const sink: TraceSink = {
  write(event) {
    traceEvents.push(event)
  },
}

async function flushTraceBus(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('Phase 1 / WP1-A Query state integration', () => {
  beforeEach(() => {
    traceEvents.length = 0
    const bus = getTraceBus()
    bus.clearSinks()
    bus.addSink(sink)
  })

  afterEach(async () => {
    await flushTraceBus()
    getTraceBus().clearSinks()
  })

  test('normal path syncs store turn state and stop reason', async () => {
    const store = createStore({
      model: 'claude-sonnet-4-6',
      permissionMode: 'auto',
      quiet: true,
      cwd: process.cwd(),
    })

    const machine = createTurnStateMachine({
      onTransition: (transition) => store.getState().applyTurnTransition(transition),
    })

    machine.transition({ type: 'turn_start', turnId: 'turn_int_1' })
    machine.transition({ type: 'tool_use_detected', toolMode: 'auto' })
    machine.transition({ type: 'tool_result_written' })
    machine.transition({ type: 'assistant_done' })

    const state = store.getState()
    expect(state.currentTurnId).toBe('turn_int_1')
    expect(state.turnState).toBe('stopped')
    expect(state.turnStopReason).toBe('completed')

    await flushTraceBus()
    const transitions = traceEvents.filter(
      (event) => event.stage === 'state' && event.event === 'turn_transition',
    )
    expect(transitions.length).toBe(4)
    expect(transitions[0]?.payload).toMatchObject({
      from: 'idle',
      to: 'streaming',
      event: 'turn_start',
    })
    expect(transitions[3]?.payload).toMatchObject({
      from: 'streaming',
      to: 'stopped',
      event: 'assistant_done',
      reason: 'completed',
    })
  })

  test('permission denied path lands in stopped(permission_denied)', () => {
    const store = createStore({
      model: 'claude-sonnet-4-6',
      permissionMode: 'ask',
      quiet: true,
      cwd: process.cwd(),
    })

    const machine = createTurnStateMachine({
      onTransition: (transition) => store.getState().applyTurnTransition(transition),
    })

    machine.transition({ type: 'turn_start', turnId: 'turn_int_2' })
    machine.transition({ type: 'tool_use_detected', toolMode: 'ask' })
    machine.transition({ type: 'permission_denied' })

    const state = store.getState()
    expect(state.turnState).toBe('stopped')
    expect(state.turnStopReason).toBe('permission_denied')
  })
})
