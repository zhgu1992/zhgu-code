import type { PermissionMode } from '../../definitions/types/permission.js'

export type PermissionReasonCode =
  | 'approved'
  | 'permission_denied'
  | 'plan_mode_blocked'
  | 'permission_drift_detected'

export interface ResolvePermissionInheritanceInput {
  parentMode: PermissionMode
  requestedMode?: PermissionMode
}

export interface PermissionInheritanceAuditEvent {
  event: 'permission_inherited' | 'permission_drift_detected'
  parentMode: PermissionMode
  requestedMode: PermissionMode
  effectiveMode: PermissionMode
  reasonCode: PermissionReasonCode
}

export interface PermissionInheritanceDecision {
  effectiveMode: PermissionMode
  driftDetected: boolean
  reasonCode: PermissionReasonCode
  auditEvents: PermissionInheritanceAuditEvent[]
}

const STRICTNESS: Record<PermissionMode, number> = {
  auto: 1,
  ask: 2,
  plan: 3,
}

function isWiderThanParent(parentMode: PermissionMode, requestedMode: PermissionMode): boolean {
  return STRICTNESS[requestedMode] < STRICTNESS[parentMode]
}

export function resolvePermissionInheritance(
  input: ResolvePermissionInheritanceInput,
): PermissionInheritanceDecision {
  const requestedMode = input.requestedMode ?? input.parentMode
  if (!isWiderThanParent(input.parentMode, requestedMode)) {
    return {
      effectiveMode: requestedMode,
      driftDetected: false,
      reasonCode: 'approved',
      auditEvents: [
        {
          event: 'permission_inherited',
          parentMode: input.parentMode,
          requestedMode,
          effectiveMode: requestedMode,
          reasonCode: 'approved',
        },
      ],
    }
  }

  return {
    effectiveMode: 'ask',
    driftDetected: true,
    reasonCode: 'permission_drift_detected',
    auditEvents: [
      {
        event: 'permission_drift_detected',
        parentMode: input.parentMode,
        requestedMode,
        effectiveMode: 'ask',
        reasonCode: 'permission_drift_detected',
      },
    ],
  }
}
