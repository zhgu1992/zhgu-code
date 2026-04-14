export type PlanState =
  | 'draft'
  | 'awaiting-approval'
  | 'running'
  | 'blocked'
  | 'completed'
  | 'cancelled'
  | 'failed'

export type PlanFailureReason = 'permission_denied' | 'runtime_error'

export type PlanTerminalReason = PlanFailureReason | 'user_cancelled' | null

export type PlanEvent =
  | 'submit_for_approval'
  | 'approval_granted'
  | 'approval_rejected'
  | 'mark_blocked'
  | 'resume'
  | 'complete'
  | 'cancel'
  | 'fail'

export interface PlanTransitionInput {
  type: PlanEvent
  reason?: PlanFailureReason
}

export interface PlanSnapshot {
  planId: string
  state: PlanState
  terminalReason: PlanTerminalReason
}

export interface PlanStateTransition {
  planId: string
  from: PlanState
  to: PlanState
  event: PlanEvent
  reason?: PlanTerminalReason
}

export interface CreatePlanStateMachineOptions {
  planId: string
  initialState?: PlanState
  onTransition?: (transition: PlanStateTransition) => void
}

const TERMINAL_PLAN_STATES: ReadonlySet<PlanState> = new Set([
  'completed',
  'cancelled',
  'failed',
])

export class IllegalPlanTransitionError extends Error {
  constructor(
    public readonly state: PlanState,
    public readonly event: PlanEvent,
    message?: string,
  ) {
    super(message ?? `Illegal plan transition: ${state} -> ${event}`)
    this.name = 'IllegalPlanTransitionError'
  }
}

export class PlanStateMachine {
  private snapshot: PlanSnapshot

  constructor(private readonly options: CreatePlanStateMachineOptions) {
    this.snapshot = {
      planId: options.planId,
      state: options.initialState ?? 'draft',
      terminalReason: null,
    }
    this.assertInvariants(this.snapshot)
  }

  getSnapshot(): PlanSnapshot {
    return { ...this.snapshot }
  }

  transition(input: PlanTransitionInput): PlanSnapshot {
    const from = this.snapshot.state
    const to = this.resolveNextState(from, input)
    const terminalReason = this.resolveTerminalReason(to, input)

    const nextSnapshot: PlanSnapshot = {
      planId: this.snapshot.planId,
      state: to,
      terminalReason,
    }

    this.assertInvariants(nextSnapshot)
    this.snapshot = nextSnapshot

    this.options.onTransition?.({
      planId: this.snapshot.planId,
      from,
      to,
      event: input.type,
      reason: terminalReason ?? undefined,
    })

    return this.getSnapshot()
  }

  private resolveNextState(state: PlanState, input: PlanTransitionInput): PlanState {
    if (TERMINAL_PLAN_STATES.has(state)) {
      throw new IllegalPlanTransitionError(state, input.type)
    }

    switch (state) {
      case 'draft':
        if (input.type === 'submit_for_approval') {
          return 'awaiting-approval'
        }
        throw new IllegalPlanTransitionError(state, input.type)

      case 'awaiting-approval':
        if (input.type === 'approval_granted') {
          return 'running'
        }
        if (input.type === 'approval_rejected') {
          return 'failed'
        }
        if (input.type === 'cancel') {
          return 'cancelled'
        }
        throw new IllegalPlanTransitionError(state, input.type)

      case 'running':
        if (input.type === 'mark_blocked') {
          return 'blocked'
        }
        if (input.type === 'complete') {
          return 'completed'
        }
        if (input.type === 'cancel') {
          return 'cancelled'
        }
        if (input.type === 'fail') {
          return 'failed'
        }
        throw new IllegalPlanTransitionError(state, input.type)

      case 'blocked':
        if (input.type === 'resume') {
          return 'running'
        }
        if (input.type === 'cancel') {
          return 'cancelled'
        }
        if (input.type === 'fail') {
          return 'failed'
        }
        throw new IllegalPlanTransitionError(state, input.type)

      case 'completed':
      case 'cancelled':
      case 'failed':
        throw new IllegalPlanTransitionError(state, input.type)
    }
  }

  private resolveTerminalReason(
    nextState: PlanState,
    input: PlanTransitionInput,
  ): PlanTerminalReason {
    if (nextState === 'failed') {
      if (input.type === 'approval_rejected') {
        return 'permission_denied'
      }
      if (input.type === 'fail') {
        return input.reason ?? 'runtime_error'
      }
      throw new IllegalPlanTransitionError(
        this.snapshot.state,
        input.type,
        `Missing failure reason mapping for event ${input.type}`,
      )
    }

    if (nextState === 'cancelled') {
      return 'user_cancelled'
    }

    return null
  }

  private assertInvariants(snapshot: PlanSnapshot): void {
    if (snapshot.planId.length === 0) {
      throw new Error('Invariant violation: planId is required')
    }

    if (snapshot.state !== 'failed' && snapshot.terminalReason === 'permission_denied') {
      throw new Error(
        `Invariant violation: permission_denied can only appear in failed state (state=${snapshot.state})`,
      )
    }

    if (snapshot.state !== 'cancelled' && snapshot.terminalReason === 'user_cancelled') {
      throw new Error(
        `Invariant violation: user_cancelled can only appear in cancelled state (state=${snapshot.state})`,
      )
    }
  }
}

export function createPlanStateMachine(
  options: CreatePlanStateMachineOptions,
): PlanStateMachine {
  return new PlanStateMachine(options)
}
