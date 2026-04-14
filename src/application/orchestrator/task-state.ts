import type { TaskTerminalReason } from '../../architecture/contracts/orchestrator.js'

export type TaskState =
  | 'pending'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'canceled'

export type TaskEvent = 'start' | 'pause' | 'resume' | 'complete' | 'cancel' | 'fail'

export interface TaskTransitionInput {
  type: TaskEvent
  reason?: TaskTerminalReason
}

export interface TaskSnapshot {
  taskId: string
  state: TaskState
  terminalReason: TaskTerminalReason | null
}

export interface TaskStateTransition {
  taskId: string
  from: TaskState
  to: TaskState
  event: TaskEvent
  reason?: TaskTerminalReason
}

export interface CreateTaskStateMachineOptions {
  taskId: string
  initialState?: TaskState
  onTransition?: (transition: TaskStateTransition) => void
}

const TERMINAL_TASK_STATES: ReadonlySet<TaskState> = new Set([
  'completed',
  'failed',
  'canceled',
])

export class IllegalTaskTransitionError extends Error {
  constructor(
    public readonly state: TaskState,
    public readonly event: TaskEvent,
    message?: string,
  ) {
    super(message ?? `Illegal task transition: ${state} -> ${event}`)
    this.name = 'IllegalTaskTransitionError'
  }
}

export class TaskStateMachine {
  private snapshot: TaskSnapshot

  constructor(private readonly options: CreateTaskStateMachineOptions) {
    this.snapshot = {
      taskId: options.taskId,
      state: options.initialState ?? 'pending',
      terminalReason: null,
    }
    this.assertInvariants(this.snapshot)
  }

  getSnapshot(): TaskSnapshot {
    return { ...this.snapshot }
  }

  transition(input: TaskTransitionInput): TaskSnapshot {
    const from = this.snapshot.state
    const to = this.resolveNextState(from, input)
    const terminalReason = this.resolveTerminalReason(to, input)

    const nextSnapshot: TaskSnapshot = {
      taskId: this.snapshot.taskId,
      state: to,
      terminalReason,
    }

    this.assertInvariants(nextSnapshot)
    this.snapshot = nextSnapshot

    this.options.onTransition?.({
      taskId: this.snapshot.taskId,
      from,
      to,
      event: input.type,
      reason: terminalReason ?? undefined,
    })

    return this.getSnapshot()
  }

  private resolveNextState(state: TaskState, input: TaskTransitionInput): TaskState {
    if (TERMINAL_TASK_STATES.has(state)) {
      throw new IllegalTaskTransitionError(state, input.type)
    }

    switch (state) {
      case 'pending':
        if (input.type === 'start') {
          return 'running'
        }
        if (input.type === 'cancel') {
          return 'canceled'
        }
        throw new IllegalTaskTransitionError(state, input.type)

      case 'running':
        if (input.type === 'pause') {
          return 'paused'
        }
        if (input.type === 'complete') {
          return 'completed'
        }
        if (input.type === 'cancel') {
          return 'canceled'
        }
        if (input.type === 'fail') {
          return 'failed'
        }
        throw new IllegalTaskTransitionError(state, input.type)

      case 'paused':
        if (input.type === 'resume') {
          return 'running'
        }
        if (input.type === 'cancel') {
          return 'canceled'
        }
        if (input.type === 'fail') {
          return 'failed'
        }
        throw new IllegalTaskTransitionError(state, input.type)

      case 'completed':
      case 'failed':
      case 'canceled':
        throw new IllegalTaskTransitionError(state, input.type)
    }
  }

  private resolveTerminalReason(
    nextState: TaskState,
    input: TaskTransitionInput,
  ): TaskTerminalReason | null {
    if (nextState === 'failed') {
      if (input.type !== 'fail') {
        throw new IllegalTaskTransitionError(
          this.snapshot.state,
          input.type,
          `Missing failure reason mapping for event ${input.type}`,
        )
      }
      return input.reason ?? 'runtime_error'
    }

    if (nextState === 'canceled') {
      if (input.type !== 'cancel') {
        throw new IllegalTaskTransitionError(
          this.snapshot.state,
          input.type,
          `Missing cancel reason mapping for event ${input.type}`,
        )
      }
      return input.reason ?? 'user_canceled'
    }

    return null
  }

  private assertInvariants(snapshot: TaskSnapshot): void {
    if (snapshot.taskId.length === 0) {
      throw new Error('Invariant violation: taskId is required')
    }

    if (snapshot.state === 'completed' && snapshot.terminalReason !== null) {
      throw new Error(
        `Invariant violation: completed cannot have terminalReason (reason=${snapshot.terminalReason})`,
      )
    }

    if (
      snapshot.state !== 'failed' &&
      (snapshot.terminalReason === 'runtime_error' ||
        snapshot.terminalReason === 'permission_denied' ||
        snapshot.terminalReason === 'dependency_failed' ||
        snapshot.terminalReason === 'timeout')
    ) {
      throw new Error(
        `Invariant violation: failure reasons can only appear in failed state (state=${snapshot.state})`,
      )
    }

    if (snapshot.state !== 'canceled' && snapshot.terminalReason === 'user_canceled') {
      throw new Error(
        `Invariant violation: user_canceled can only appear in canceled state (state=${snapshot.state})`,
      )
    }
  }
}

export function createTaskStateMachine(
  options: CreateTaskStateMachineOptions,
): TaskStateMachine {
  return new TaskStateMachine(options)
}
