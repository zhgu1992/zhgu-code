import type { PermissionMode } from '../../definitions/types/permission.js'
import {
  resolvePermissionInheritance,
  type PermissionInheritanceAuditEvent,
  type PermissionReasonCode,
} from './permission-inheritance.js'

export type PlanApprovalStatus = 'pending' | 'approved' | 'rejected'

export interface ApprovalContext {
  planId: string
  planMode: PermissionMode
  planApprovalStatus: PlanApprovalStatus
}

export interface TaskAdmissionInput {
  taskId: string
  requestedMode?: PermissionMode
}

export interface ToolCallApprovalInput {
  taskId: string
  toolName: string
  requestedMode?: PermissionMode
}

export interface ApprovalAuditEvent {
  event:
    | 'plan_approved'
    | 'task_admitted'
    | 'task_rejected'
    | 'tool_call_allowed'
    | 'tool_call_denied'
    | PermissionInheritanceAuditEvent['event']
  planId: string
  taskId?: string
  toolName?: string
  reasonCode: PermissionReasonCode
  effectiveMode?: PermissionMode
  eventSeq: number
}

export interface TaskAdmissionDecision {
  allowed: boolean
  taskStatus: 'admitted' | 'failed'
  effectiveMode: PermissionMode
  reasonCode: PermissionReasonCode
  auditEvents: ApprovalAuditEvent[]
}

export interface ToolCallApprovalDecision {
  allowed: boolean
  effectiveMode: PermissionMode
  reasonCode: PermissionReasonCode
  driftDetected: boolean
  auditEvents: ApprovalAuditEvent[]
}

function mapToApprovalAudit(
  planId: string,
  taskId: string,
  events: PermissionInheritanceAuditEvent[],
): ApprovalAuditEvent[] {
  return events.map((event) => ({
    event: event.event,
    planId,
    taskId,
    reasonCode: event.reasonCode,
    effectiveMode: event.effectiveMode,
    eventSeq: event.eventSeq,
  }))
}

function withEventSeq(events: Omit<ApprovalAuditEvent, 'eventSeq'>[]): ApprovalAuditEvent[] {
  return events.map((event, index) => ({
    ...event,
    eventSeq: index + 1,
  }))
}

export function evaluateTaskAdmission(
  context: ApprovalContext,
  input: TaskAdmissionInput,
): TaskAdmissionDecision {
  if (context.planApprovalStatus === 'pending') {
    return {
      allowed: false,
      taskStatus: 'failed',
      effectiveMode: 'ask',
      reasonCode: 'plan_mode_blocked',
      auditEvents: [
        {
          event: 'task_rejected',
          planId: context.planId,
          taskId: input.taskId,
          reasonCode: 'plan_mode_blocked',
          effectiveMode: 'ask',
          eventSeq: 1,
        },
      ],
    }
  }

  if (context.planApprovalStatus === 'rejected') {
    return {
      allowed: false,
      taskStatus: 'failed',
      effectiveMode: 'ask',
      reasonCode: 'permission_denied',
      auditEvents: [
        {
          event: 'task_rejected',
          planId: context.planId,
          taskId: input.taskId,
          reasonCode: 'permission_denied',
          effectiveMode: 'ask',
          eventSeq: 1,
        },
      ],
    }
  }

  const inheritance = resolvePermissionInheritance({
    parentMode: context.planMode,
    requestedMode: input.requestedMode,
  })

  const allowed = !inheritance.driftDetected
  const reasonCode: PermissionReasonCode = allowed
    ? inheritance.reasonCode
    : 'permission_denied'

  const auditEvents = withEventSeq([
    {
      event: 'plan_approved',
      planId: context.planId,
      reasonCode: 'approved',
      effectiveMode: context.planMode,
    },
    ...mapToApprovalAudit(context.planId, input.taskId, inheritance.auditEvents),
    {
      event: allowed ? 'task_admitted' : 'task_rejected',
      planId: context.planId,
      taskId: input.taskId,
      reasonCode,
      effectiveMode: inheritance.effectiveMode,
    },
  ])

  return {
    allowed,
    taskStatus: allowed ? 'admitted' : 'failed',
    effectiveMode: inheritance.effectiveMode,
    reasonCode,
    auditEvents,
  }
}

export function evaluateToolCallApproval(
  context: ApprovalContext,
  input: ToolCallApprovalInput,
): ToolCallApprovalDecision {
  if (context.planApprovalStatus !== 'approved') {
    const reasonCode: PermissionReasonCode =
      context.planApprovalStatus === 'pending' ? 'plan_mode_blocked' : 'permission_denied'
    return {
      allowed: false,
      effectiveMode: 'ask',
      reasonCode,
      driftDetected: false,
      auditEvents: [
        {
          event: 'tool_call_denied',
          planId: context.planId,
          taskId: input.taskId,
          toolName: input.toolName,
          reasonCode,
          effectiveMode: 'ask',
          eventSeq: 1,
        },
      ],
    }
  }

  const inheritance = resolvePermissionInheritance({
    parentMode: context.planMode,
    requestedMode: input.requestedMode,
  })
  const allowed = !inheritance.driftDetected
  const reasonCode: PermissionReasonCode = allowed
    ? inheritance.reasonCode
    : 'permission_denied'

  return {
    allowed,
    effectiveMode: inheritance.effectiveMode,
    driftDetected: inheritance.driftDetected,
    reasonCode,
    auditEvents: withEventSeq([
      {
        event: 'plan_approved',
        planId: context.planId,
        taskId: input.taskId,
        reasonCode: 'approved',
        effectiveMode: context.planMode,
      },
      ...mapToApprovalAudit(context.planId, input.taskId, inheritance.auditEvents),
      {
        event: allowed ? 'tool_call_allowed' : 'tool_call_denied',
        planId: context.planId,
        taskId: input.taskId,
        toolName: input.toolName,
        reasonCode,
        effectiveMode: inheritance.effectiveMode,
      },
    ]),
  }
}
