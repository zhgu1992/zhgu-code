import type { CapabilityDescriptor } from '../../platform/integration/registry/types.js'
import {
  createTaskLifecycleModel,
  type TaskLifecycleModel,
  type TaskLifecycleSnapshot,
} from './task-model.js'
import type { TaskTerminalReason } from '../../architecture/contracts/orchestrator.js'
import type { TaskEvent } from './task-state.js'

export interface TaskExecutorBinding {
  toolName: string
  capabilityId?: string
  capabilitySource?: CapabilityDescriptor['source']
}

export interface TaskQueueItem {
  taskId: string
  title: string
  snapshot: TaskLifecycleSnapshot
  executorBinding: TaskExecutorBinding | null
}

export interface EnqueueTaskInput {
  taskId: string
  title: string
}

export interface BindTaskExecutorInput extends TaskExecutorBinding {
  taskId: string
}

interface TaskQueueEntry {
  lifecycle: TaskLifecycleModel
  executorBinding: TaskExecutorBinding | null
}

export class TaskQueue {
  private readonly order: string[] = []
  private readonly entries = new Map<string, TaskQueueEntry>()

  enqueue(input: EnqueueTaskInput): TaskQueueItem {
    let entry = this.entries.get(input.taskId)
    if (!entry) {
      entry = {
        lifecycle: createTaskLifecycleModel({
          taskId: input.taskId,
          title: input.title,
        }),
        executorBinding: null,
      }
      this.entries.set(input.taskId, entry)
      this.order.push(input.taskId)
    }
    return this.toItem(input.taskId, entry)
  }

  bindExecutor(input: BindTaskExecutorInput): TaskQueueItem {
    const entry = this.requireEntry(input.taskId)
    entry.executorBinding = {
      toolName: input.toolName,
      capabilityId: input.capabilityId,
      capabilitySource: input.capabilitySource,
    }
    return this.toItem(input.taskId, entry)
  }

  get(taskId: string): TaskQueueItem | null {
    const entry = this.entries.get(taskId)
    if (!entry) {
      return null
    }
    return this.toItem(taskId, entry)
  }

  size(): number {
    return this.order.length
  }

  transition(taskId: string, event: TaskEvent, reason?: TaskTerminalReason): TaskQueueItem {
    const entry = this.requireEntry(taskId)
    entry.lifecycle.transition(event, reason)
    return this.toItem(taskId, entry)
  }

  private toItem(taskId: string, entry: TaskQueueEntry): TaskQueueItem {
    return {
      taskId,
      title: entry.lifecycle.getSnapshot().title,
      snapshot: entry.lifecycle.getSnapshot(),
      executorBinding: entry.executorBinding ? { ...entry.executorBinding } : null,
    }
  }

  private requireEntry(taskId: string): TaskQueueEntry {
    const entry = this.entries.get(taskId)
    if (!entry) {
      throw new Error(`Task ${taskId} is not in queue`)
    }
    return entry
  }
}

export function createTaskQueue(): TaskQueue {
  return new TaskQueue()
}
