import type {
  QueryTurnEvent,
  QueryTurnState,
  QueryTurnStopReason,
  QueryTurnTransition,
} from '../../architecture/contracts/query-engine.js'

export type ToolExecutionMode = 'auto' | 'ask'

export interface TurnTransitionInput {
  type: QueryTurnEvent
  turnId?: string
  toolMode?: ToolExecutionMode
}

export interface TurnMachineSnapshot {
  turnId: string | null
  state: QueryTurnState
  stopReason: QueryTurnStopReason | null
}

export interface CreateTurnStateMachineOptions {
  initialState?: QueryTurnState
  initialTurnId?: string | null
  onTransition?: (transition: QueryTurnTransition) => void
}

export class IllegalTurnTransitionError extends Error {
  constructor(
    public readonly state: QueryTurnState,
    public readonly event: QueryTurnEvent,
    message?: string,
  ) {
    super(message ?? `Illegal turn transition: ${state} -> ${event}`)
    this.name = 'IllegalTurnTransitionError'
  }
}

export class TurnStateMachine {
  private snapshot: TurnMachineSnapshot

  constructor(private readonly options: CreateTurnStateMachineOptions = {}) {
    this.snapshot = {
      turnId: options.initialTurnId ?? null,
      state: options.initialState ?? 'idle',
      stopReason: null,
    }
    this.assertInvariants(this.snapshot)
  }

  getSnapshot(): TurnMachineSnapshot {
    return { ...this.snapshot }
  }

  transition(input: TurnTransitionInput): TurnMachineSnapshot {
    const from = this.snapshot.state
    const to = this.resolveNextState(from, input)
    const stopReason = this.resolveStopReason(input, to)
    const nextTurnId = this.resolveTurnId(input, to)

    const nextSnapshot: TurnMachineSnapshot = {
      turnId: nextTurnId,
      state: to,
      stopReason,
    }

    this.assertInvariants(nextSnapshot)
    this.snapshot = nextSnapshot

    this.options.onTransition?.({
      turnId: nextSnapshot.turnId,
      from,
      to,
      event: input.type,
      reason: stopReason ?? undefined,
    })

    return this.getSnapshot()
  }

  private resolveTurnId(input: TurnTransitionInput, to: QueryTurnState): string | null {
    if (input.type === 'turn_start') {
      return input.turnId ?? this.snapshot.turnId
    }
    return to === 'idle' ? null : this.snapshot.turnId
  }

  private resolveStopReason(
    input: TurnTransitionInput,
    to: QueryTurnState,
  ): QueryTurnStopReason | null {
    if (to !== 'stopped') {
      return null
    }

    switch (input.type) {
      case 'assistant_done':
        return 'completed'
      case 'permission_denied':
        return 'permission_denied'
      case 'recovery_failed':
      case 'retry_exhausted':
        return 'recovery_failed'
      case 'user_cancelled':
        return 'cancelled'
      case 'budget_exceeded':
        return 'budget_exceeded'
      case 'fatal_error':
        return 'fatal_error'
      default:
        throw new IllegalTurnTransitionError(
          this.snapshot.state,
          input.type,
          `Missing stop reason mapping for event ${input.type}`,
        )
    }
  }

  private resolveNextState(
    state: QueryTurnState,
    input: TurnTransitionInput,
  ): QueryTurnState {
    if (state === 'stopped') {
      throw new IllegalTurnTransitionError(state, input.type)
    }

    if (input.type === 'turn_start') {
      if (state !== 'idle') {
        throw new IllegalTurnTransitionError(state, input.type)
      }
      if (this.snapshot.turnId) {
        throw new IllegalTurnTransitionError(
          state,
          input.type,
          `Cannot start a second active turn while turnId=${this.snapshot.turnId} is active`,
        )
      }
      if (!input.turnId) {
        throw new IllegalTurnTransitionError(state, input.type, 'turn_start requires turnId')
      }
      return 'streaming'
    }

    if (input.type === 'user_cancelled') {
      return 'stopped'
    }
    if (input.type === 'budget_exceeded') {
      return 'stopped'
    }
    if (input.type === 'fatal_error') {
      return 'stopped'
    }

    switch (state) {
      case 'idle':
        throw new IllegalTurnTransitionError(state, input.type)

      case 'streaming':
        if (input.type === 'tool_use_detected') {
          return input.toolMode === 'ask' ? 'awaiting-permission' : 'tool-running'
        }
        if (input.type === 'assistant_done') {
          return 'stopped'
        }
        if (input.type === 'recoverable_error') {
          return 'recovering'
        }
        throw new IllegalTurnTransitionError(state, input.type)

      case 'awaiting-permission':
        if (input.type === 'permission_approved') {
          return 'tool-running'
        }
        if (input.type === 'permission_denied') {
          return 'stopped'
        }
        throw new IllegalTurnTransitionError(state, input.type)

      case 'tool-running':
        if (input.type === 'tool_result_written') {
          return 'streaming'
        }
        if (input.type === 'recoverable_error') {
          return 'recovering'
        }
        throw new IllegalTurnTransitionError(state, input.type)

      case 'recovering':
        if (input.type === 'recovery_succeeded') {
          return 'streaming'
        }
        if (input.type === 'recovery_failed' || input.type === 'retry_exhausted') {
          return 'stopped'
        }
        throw new IllegalTurnTransitionError(state, input.type)
    }
  }

  private assertInvariants(snapshot: TurnMachineSnapshot): void {
    if (snapshot.state === 'idle' && snapshot.turnId !== null) {
      throw new Error('Invariant violation: idle state must not keep an active turnId')
    }

    if (
      snapshot.state !== 'idle' &&
      snapshot.state !== 'stopped' &&
      snapshot.turnId === null
    ) {
      throw new Error(`Invariant violation: ${snapshot.state} requires active turnId`)
    }

    if (snapshot.state !== 'stopped' && snapshot.stopReason !== null) {
      throw new Error(
        `Invariant violation: stopReason is only allowed in stopped state (state=${snapshot.state})`,
      )
    }
  }
}

export function createTurnStateMachine(
  options?: CreateTurnStateMachineOptions,
): TurnStateMachine {
  return new TurnStateMachine(options)
}
