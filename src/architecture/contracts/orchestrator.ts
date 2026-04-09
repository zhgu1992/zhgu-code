export type OrchestratorMode = 'chat' | 'plan'

export type TaskStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'canceled'

export interface TaskRecord {
  id: string
  title: string
  status: TaskStatus
  createdAt: string
  updatedAt: string
  output?: string
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
  updateTaskStatus(taskId: string, status: TaskStatus, output?: string): Promise<void>
  cancelTask(taskId: string): Promise<void>
  listTasks(sessionId: string): Promise<TaskRecord[]>
}
