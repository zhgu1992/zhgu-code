import type { PermissionMode } from '../../definitions/types/permission.js'
import type { TaskStatus } from '../../architecture/contracts/orchestrator.js'
import type { PlanApprovalStatus } from './approval.js'
import type { PlanState, PlanTerminalReason } from './plan-state.js'

export interface RuntimeTaskIndexEntry {
  taskId: string
  title: string
  status: TaskStatus
  taskEventSeq: number
  updatedAt: string
}

export interface ActivePlanContextSnapshot {
  planId: string
  state: PlanState
  terminalReason: PlanTerminalReason
  planMode: PermissionMode
  planApprovalStatus: PlanApprovalStatus
  taskIndex: Record<string, RuntimeTaskIndexEntry>
  createdAt: string
  updatedAt: string
}

export interface RuntimeSessionSnapshot {
  sessionId: string
  activePlan: ActivePlanContextSnapshot | null
  updatedAt: string
}

export interface CreateRuntimeSessionInput {
  sessionId: string
  now?: string
}

export interface WriteActivePlanContextInput {
  planId: string
  state?: PlanState
  terminalReason?: PlanTerminalReason
  planMode: PermissionMode
  planApprovalStatus?: PlanApprovalStatus
  taskIndex?: Record<string, RuntimeTaskIndexEntry>
  now?: string
}

export interface PatchActivePlanContextInput {
  state?: PlanState
  terminalReason?: PlanTerminalReason
  planMode?: PermissionMode
  planApprovalStatus?: PlanApprovalStatus
  now?: string
}

export interface UpsertActivePlanTaskInput {
  taskId: string
  title: string
  status: TaskStatus
  taskEventSeq: number
  updatedAt?: string
}

function nowIso(): string {
  return new Date().toISOString()
}

export function createRuntimeSessionSnapshot(
  input: CreateRuntimeSessionInput,
): RuntimeSessionSnapshot {
  const now = input.now ?? nowIso()
  return {
    sessionId: input.sessionId,
    activePlan: null,
    updatedAt: now,
  }
}

export function readActivePlanContext(
  session: RuntimeSessionSnapshot,
): ActivePlanContextSnapshot | null {
  return session.activePlan
}

export function writeActivePlanContext(
  session: RuntimeSessionSnapshot,
  input: WriteActivePlanContextInput | null,
): RuntimeSessionSnapshot {
  const now = input?.now ?? nowIso()
  if (!input) {
    return {
      ...session,
      activePlan: null,
      updatedAt: now,
    }
  }

  const createdAt = session.activePlan?.createdAt ?? now
  const next: ActivePlanContextSnapshot = {
    planId: input.planId,
    state: input.state ?? 'draft',
    terminalReason: input.terminalReason ?? null,
    planMode: input.planMode,
    planApprovalStatus: input.planApprovalStatus ?? 'pending',
    taskIndex: input.taskIndex ? { ...input.taskIndex } : {},
    createdAt,
    updatedAt: now,
  }

  return {
    ...session,
    activePlan: next,
    updatedAt: now,
  }
}

export function patchActivePlanContext(
  session: RuntimeSessionSnapshot,
  input: PatchActivePlanContextInput,
): RuntimeSessionSnapshot {
  if (!session.activePlan) {
    return session
  }

  const now = input.now ?? nowIso()
  return {
    ...session,
    activePlan: {
      ...session.activePlan,
      state: input.state ?? session.activePlan.state,
      terminalReason:
        input.terminalReason === undefined
          ? session.activePlan.terminalReason
          : input.terminalReason,
      planMode: input.planMode ?? session.activePlan.planMode,
      planApprovalStatus: input.planApprovalStatus ?? session.activePlan.planApprovalStatus,
      updatedAt: now,
    },
    updatedAt: now,
  }
}

export function upsertActivePlanTask(
  session: RuntimeSessionSnapshot,
  input: UpsertActivePlanTaskInput,
): RuntimeSessionSnapshot {
  if (!session.activePlan) {
    return session
  }

  const taskUpdatedAt = input.updatedAt ?? nowIso()
  const nextTaskIndex = {
    ...session.activePlan.taskIndex,
    [input.taskId]: {
      taskId: input.taskId,
      title: input.title,
      status: input.status,
      taskEventSeq: input.taskEventSeq,
      updatedAt: taskUpdatedAt,
    },
  }

  return {
    ...session,
    activePlan: {
      ...session.activePlan,
      taskIndex: nextTaskIndex,
      updatedAt: taskUpdatedAt,
    },
    updatedAt: taskUpdatedAt,
  }
}
