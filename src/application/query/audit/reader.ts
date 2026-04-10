import { readFile } from 'node:fs/promises'
import type {
  AuditEvent,
  AuditExecutionFinishedEvent,
  AuditPermissionDecidedEvent,
  AuditRequestedEvent,
} from './model.js'
import { parseAuditEvent } from './model.js'

export interface AuditReadIssue {
  line: number
  reason: string
}

export interface AuditReadResult {
  events: AuditEvent[]
  issues: AuditReadIssue[]
}

export interface AuditReplaySummary {
  requestId: string
  toolName: string
  mode?: string
  permissionAction?: string
  reasonCode?: string
  riskLevel?: string
  startedAt?: string
  endedAt?: string
  success?: boolean
  boundaryBlocked?: boolean
  boundaryReasonCode?: string
}

export interface AuditRequestReplay {
  requestId: string
  steps: AuditEvent[]
  summary: AuditReplaySummary
  partial: boolean
  gaps: string[]
}

export async function readAuditFile(filePath: string): Promise<AuditReadResult> {
  const content = await readFile(filePath, 'utf8')
  return parseAuditJsonl(content)
}

export function parseAuditJsonl(content: string): AuditReadResult {
  const events: AuditEvent[] = []
  const issues: AuditReadIssue[] = []
  const lines = content.split(/\r?\n/)

  for (let idx = 0; idx < lines.length; idx += 1) {
    const line = lines[idx]
    if (!line || line.trim().length === 0) {
      continue
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      issues.push({ line: idx + 1, reason: 'invalid json' })
      continue
    }

    const result = parseAuditEvent(parsed)
    if (!result.ok) {
      issues.push({ line: idx + 1, reason: result.error })
      continue
    }
    events.push(result.event)
  }

  return { events, issues }
}

export function replayAuditRequest(events: AuditEvent[], requestId: string): AuditRequestReplay | null {
  const filtered = events
    .filter((event) => event.request_id === requestId)
    .sort((left, right) => left.seq - right.seq || left.ts.localeCompare(right.ts))

  if (filtered.length === 0) {
    return null
  }

  const requested = filtered.find((event): event is AuditRequestedEvent => event.type === 'audit.requested')
  const permission = filtered.find(
    (event): event is AuditPermissionDecidedEvent => event.type === 'audit.permission_decided',
  )
  let finished: AuditExecutionFinishedEvent | undefined
  for (let idx = filtered.length - 1; idx >= 0; idx -= 1) {
    const event = filtered[idx]
    if (event?.type === 'audit.execution_finished') {
      finished = event
      break
    }
  }

  const gaps: string[] = []
  if (!requested) {
    gaps.push('missing_requested')
  }
  if (!permission) {
    gaps.push('missing_permission_decided')
  }
  if (!finished) {
    gaps.push('missing_execution_finished')
  }

  const summary: AuditReplaySummary = {
    requestId,
    toolName: filtered[0].tool_name,
    mode: permission?.mode ?? requested?.mode,
    permissionAction: permission?.permission_action,
    reasonCode: finished?.reason_code ?? permission?.reason_code,
    riskLevel: permission?.risk_level,
    startedAt: requested?.started_at,
    endedAt: finished?.ended_at,
    success: finished?.success,
    boundaryBlocked: finished?.boundary_blocked,
    boundaryReasonCode: finished?.boundary_reason_code,
  }

  return {
    requestId,
    steps: filtered,
    summary,
    partial: gaps.length > 0,
    gaps,
  }
}
