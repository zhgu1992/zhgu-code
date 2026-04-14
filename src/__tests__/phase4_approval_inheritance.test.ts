import { describe, expect, test } from 'bun:test'
import {
  evaluateTaskAdmission,
  evaluateToolCallApproval,
  resolvePermissionInheritance,
} from '../application/orchestrator/index.js'

describe('Phase 4 / WP4-D Approval and permission inheritance', () => {
  test('APR-001 plan not approved should block task admission', () => {
    const result = evaluateTaskAdmission(
      {
        planId: 'plan_1',
        planMode: 'ask',
        planApprovalStatus: 'pending',
      },
      {
        taskId: 'task_1',
      },
    )

    expect(result.allowed).toBe(false)
    expect(result.taskStatus).toBe('failed')
    expect(result.reasonCode).toBe('plan_mode_blocked')
  })

  test('APR-002 plan=ask should default task permission to ask and deny auto upgrade', () => {
    const inherited = resolvePermissionInheritance({
      parentMode: 'ask',
    })
    expect(inherited.effectiveMode).toBe('ask')

    const upgraded = evaluateTaskAdmission(
      {
        planId: 'plan_2',
        planMode: 'ask',
        planApprovalStatus: 'approved',
      },
      {
        taskId: 'task_2',
        requestedMode: 'auto',
      },
    )

    expect(upgraded.allowed).toBe(false)
    expect(upgraded.taskStatus).toBe('failed')
    expect(upgraded.effectiveMode).toBe('ask')
    expect(upgraded.reasonCode).toBe('permission_denied')
  })

  test('APR-003 approval rejected should fail task with permission_denied', () => {
    const result = evaluateTaskAdmission(
      {
        planId: 'plan_3',
        planMode: 'auto',
        planApprovalStatus: 'rejected',
      },
      {
        taskId: 'task_3',
      },
    )

    expect(result.allowed).toBe(false)
    expect(result.taskStatus).toBe('failed')
    expect(result.reasonCode).toBe('permission_denied')
  })

  test('APR-004 tool call should inherit upstream permission and prevent bypass', () => {
    const result = evaluateToolCallApproval(
      {
        planId: 'plan_4',
        planMode: 'ask',
        planApprovalStatus: 'approved',
      },
      {
        taskId: 'task_4',
        toolName: 'Bash',
        requestedMode: 'auto',
      },
    )

    expect(result.allowed).toBe(false)
    expect(result.reasonCode).toBe('permission_denied')
    expect(result.effectiveMode).toBe('ask')
  })

  test('APR-005 permission drift should fallback to ask and emit audit event', () => {
    const result = evaluateToolCallApproval(
      {
        planId: 'plan_5',
        planMode: 'ask',
        planApprovalStatus: 'approved',
      },
      {
        taskId: 'task_5',
        toolName: 'Read',
        requestedMode: 'auto',
      },
    )

    expect(result.driftDetected).toBe(true)
    expect(result.effectiveMode).toBe('ask')
    expect(
      result.auditEvents.some(
        (event) => event.event === 'permission_drift_detected' && event.reasonCode === 'permission_drift_detected',
      ),
    ).toBe(true)
  })
})
