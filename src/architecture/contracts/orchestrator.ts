export type OrchestratorMode = 'chat' | 'plan'

export type TaskStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'canceled'

export type TaskTerminalReason =
  | 'user_canceled'
  | 'permission_denied'
  | 'dependency_failed'
  | 'timeout'
  | 'runtime_error'

export interface TaskRecord {
  id: string
  title: string
  status: TaskStatus
  createdAt: string
  updatedAt: string
  output?: string
  terminalReason?: TaskTerminalReason
  taskEventSeq?: number
}

export interface OrchestratorSession {
  id: string
  mode: OrchestratorMode
  createdAt: string
}

export interface StartSessionInput {
  mode: OrchestratorMode
}

export interface SubmitTaskInput {
  title: string
}

export interface IOrchestrator {
  startSession(input: StartSessionInput): Promise<OrchestratorSession>
  submitTask(sessionId: string, input: SubmitTaskInput): Promise<TaskRecord>
  updateTaskStatus(
    taskId: string,
    status: TaskStatus,
    output?: string,
    reason?: TaskTerminalReason,
  ): Promise<void>
  cancelTask(taskId: string, reason?: TaskTerminalReason): Promise<void>
  listTasks(sessionId: string): Promise<TaskRecord[]>
}
