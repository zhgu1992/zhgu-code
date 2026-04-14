import type { TaskTerminalReason } from '../../architecture/contracts/orchestrator.js'
import {
  createTaskStateMachine,
  type TaskEvent,
  type TaskSnapshot,
  type TaskStateTransition,
} from './task-state.js'

export interface TaskEventRecord {
  seq: number
  event: TaskEvent
  from: TaskSnapshot['state']
  to: TaskSnapshot['state']
  reason?: TaskTerminalReason
  occurredAt: string
}

export interface TaskLifecycleSnapshot {
  taskId: string
  title: string
  status: TaskSnapshot['state']
  terminalReason: TaskTerminalReason | null
  taskEventSeq: number
  events: TaskEventRecord[]
}

export interface CreateTaskLifecycleModelOptions {
  taskId: string
  title: string
}

export class TaskLifecycleModel {
  private readonly events: TaskEventRecord[] = []
  private eventSeq = 0
  private readonly stateMachine

  constructor(private readonly options: CreateTaskLifecycleModelOptions) {
    this.stateMachine = createTaskStateMachine({
      taskId: options.taskId,
      onTransition: (transition) => this.appendEvent(transition),
    })
  }

  getSnapshot(): TaskLifecycleSnapshot {
    const snapshot = this.stateMachine.getSnapshot()
    return {
      taskId: snapshot.taskId,
      title: this.options.title,
      status: snapshot.state,
      terminalReason: snapshot.terminalReason,
      taskEventSeq: this.eventSeq,
      events: [...this.events],
    }
  }

  transition(event: TaskEvent, reason?: TaskTerminalReason): TaskLifecycleSnapshot {
    if (this.shouldIgnoreAsIdempotent(event, reason)) {
      return this.getSnapshot()
    }

    this.stateMachine.transition({ type: event, reason })
    return this.getSnapshot()
  }

  private shouldIgnoreAsIdempotent(
    event: TaskEvent,
    reason?: TaskTerminalReason,
  ): boolean {
    const snapshot = this.stateMachine.getSnapshot()
    if (snapshot.state !== 'completed' && snapshot.state !== 'failed' && snapshot.state !== 'canceled') {
      return false
    }

    if (snapshot.state === 'completed') {
      return event === 'complete'
    }

    if (snapshot.state === 'failed') {
      return event === 'fail' && (reason ?? 'runtime_error') === snapshot.terminalReason
    }

    return event === 'cancel' && (reason ?? 'user_canceled') === snapshot.terminalReason
  }

  private appendEvent(transition: TaskStateTransition): void {
    this.eventSeq += 1
    this.events.push({
      seq: this.eventSeq,
      event: transition.event,
      from: transition.from,
      to: transition.to,
      reason: transition.reason,
      occurredAt: new Date().toISOString(),
    })
  }
}

export function createTaskLifecycleModel(
  options: CreateTaskLifecycleModelOptions,
): TaskLifecycleModel {
  return new TaskLifecycleModel(options)
}
