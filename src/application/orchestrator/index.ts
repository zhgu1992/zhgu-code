import type {
  IOrchestrator,
  OrchestratorSession,
  StartSessionInput,
  SubmitTaskInput,
  TaskRecord,
  TaskStatus,
  TaskTerminalReason,
} from '../../architecture/contracts/orchestrator.js'
export * from './plan-state.js'
export * from './aggregation.js'
export * from './aggregation-strategies.js'
export * from './approval.js'
export * from './permission-inheritance.js'
export * from './runtime-session.js'
export * from './task-model.js'
export * from './task-state.js'
export * from './task-queue.js'

export class NoopOrchestrator implements IOrchestrator {
  private sessions = new Map<string, OrchestratorSession>()
  private tasks = new Map<string, TaskRecord[]>()

  async startSession(input: StartSessionInput): Promise<OrchestratorSession> {
    const now = new Date().toISOString()
    const session: OrchestratorSession = {
      id: `session_${Date.now()}`,
      mode: input.mode,
      createdAt: now,
    }
    this.sessions.set(session.id, session)
    this.tasks.set(session.id, [])
    return session
  }

  async submitTask(sessionId: string, input: SubmitTaskInput): Promise<TaskRecord> {
    const now = new Date().toISOString()
    const task: TaskRecord = {
      id: `task_${Date.now()}`,
      title: input.title,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    }
    const list = this.tasks.get(sessionId) ?? []
    list.push(task)
    this.tasks.set(sessionId, list)
    return task
  }

  async updateTaskStatus(
    taskId: string,
    status: TaskStatus,
    output?: string,
    reason?: TaskTerminalReason,
  ): Promise<void> {
    for (const list of this.tasks.values()) {
      const task = list.find((item) => item.id === taskId)
      if (task) {
        task.status = status
        task.output = output
        task.terminalReason = reason
        task.taskEventSeq = (task.taskEventSeq ?? 0) + 1
        task.updatedAt = new Date().toISOString()
        return
      }
    }
  }

  async cancelTask(taskId: string, reason: TaskTerminalReason = 'user_canceled'): Promise<void> {
    return this.updateTaskStatus(taskId, 'canceled', undefined, reason)
  }

  async listTasks(sessionId: string): Promise<TaskRecord[]> {
    return this.tasks.get(sessionId) ?? []
  }
}
