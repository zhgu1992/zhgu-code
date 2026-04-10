import type { PermissionAction } from '../../../platform/permission/index.js'
import type { ToolRiskLevel } from '../../../architecture/contracts/tool-runtime.js'

export type AuditEventType =
  | 'audit.requested'
  | 'audit.permission_decided'
  | 'audit.execution_started'
  | 'audit.execution_finished'

interface AuditEventBaseInput {
  sessionId: string
  traceId: string
  turnId?: string
  requestId: string
  toolName: string
  seq: number
  timestamp?: string
}

export interface AuditEventBase {
  ts: string
  type: AuditEventType
  session_id: string
  trace_id: string
  turn_id?: string
  request_id: string
  tool_name: string
  seq: number
}

export interface AuditRequestedEvent extends AuditEventBase {
  type: 'audit.requested'
  started_at: string
  mode: string
}

interface CreateAuditRequestedInput extends AuditEventBaseInput {
  startedAt: string
  mode: string
}

export interface AuditPermissionDecidedEvent extends AuditEventBase {
  type: 'audit.permission_decided'
  risk_level: ToolRiskLevel
  baseline_level: ToolRiskLevel
  reason_codes: string[]
  permission_action: PermissionAction | 'deny'
  reason_code?: string
  mode: string
  matched_rule_ids: string[]
}

interface CreateAuditPermissionDecidedInput extends AuditEventBaseInput {
  riskLevel: ToolRiskLevel
  baselineLevel: ToolRiskLevel
  reasonCodes: string[]
  permissionAction: PermissionAction | 'deny'
  reasonCode?: string
  mode: string
  matchedRuleIds: string[]
}

export interface AuditExecutionStartedEvent extends AuditEventBase {
  type: 'audit.execution_started'
}

export interface AuditExecutionFinishedEvent extends AuditEventBase {
  type: 'audit.execution_finished'
  success: boolean
  result: 'success' | 'denied' | 'error'
  ended_at: string
  duration_ms: number
  reason_code?: string
  error_message?: string
}

interface CreateAuditExecutionFinishedInput extends AuditEventBaseInput {
  success: boolean
  result: 'success' | 'denied' | 'error'
  endedAt: string
  durationMs: number
  reasonCode?: string
  errorMessage?: string
}

export type AuditEvent =
  | AuditRequestedEvent
  | AuditPermissionDecidedEvent
  | AuditExecutionStartedEvent
  | AuditExecutionFinishedEvent

interface ParseOk<T> {
  ok: true
  event: T
}

interface ParseErr {
  ok: false
  error: string
}

export type AuditParseResult<T = AuditEvent> = ParseOk<T> | ParseErr

export function createAuditRequestedEvent(input: CreateAuditRequestedInput): AuditRequestedEvent {
  return {
    ...createBase(input, 'audit.requested'),
    started_at: input.startedAt,
    mode: input.mode,
  }
}

export function createAuditPermissionDecidedEvent(
  input: CreateAuditPermissionDecidedInput,
): AuditPermissionDecidedEvent {
  return {
    ...createBase(input, 'audit.permission_decided'),
    risk_level: input.riskLevel,
    baseline_level: input.baselineLevel,
    reason_codes: input.reasonCodes,
    permission_action: input.permissionAction,
    reason_code: input.reasonCode,
    mode: input.mode,
    matched_rule_ids: input.matchedRuleIds,
  }
}

export function createAuditExecutionStartedEvent(
  input: AuditEventBaseInput,
): AuditExecutionStartedEvent {
  return {
    ...createBase(input, 'audit.execution_started'),
  }
}

export function createAuditExecutionFinishedEvent(
  input: CreateAuditExecutionFinishedInput,
): AuditExecutionFinishedEvent {
  return {
    ...createBase(input, 'audit.execution_finished'),
    success: input.success,
    result: input.result,
    ended_at: input.endedAt,
    duration_ms: input.durationMs,
    reason_code: input.reasonCode,
    error_message: input.errorMessage,
  }
}

export function parseAuditEvent(raw: unknown): AuditParseResult {
  if (!isRecord(raw)) {
    return { ok: false, error: 'event must be an object' }
  }

  const type = raw.type
  if (!isAuditEventType(type)) {
    return { ok: false, error: 'event.type is invalid' }
  }

  const base = parseBase(raw, type)
  if (!base.ok) {
    return base
  }

  if (type === 'audit.requested') {
    if (typeof raw.started_at !== 'string' || raw.started_at.length === 0) {
      return { ok: false, error: 'audit.requested.started_at is required' }
    }
    if (typeof raw.mode !== 'string' || raw.mode.length === 0) {
      return { ok: false, error: 'audit.requested.mode is required' }
    }
    return {
      ok: true,
      event: {
        ...base.event,
        started_at: raw.started_at,
        mode: raw.mode,
      } as AuditRequestedEvent,
    }
  }

  if (type === 'audit.permission_decided') {
    if (!isToolRiskLevel(raw.risk_level)) {
      return { ok: false, error: 'audit.permission_decided.risk_level is invalid' }
    }
    if (!isToolRiskLevel(raw.baseline_level)) {
      return { ok: false, error: 'audit.permission_decided.baseline_level is invalid' }
    }
    if (!Array.isArray(raw.reason_codes) || !raw.reason_codes.every((item) => typeof item === 'string')) {
      return { ok: false, error: 'audit.permission_decided.reason_codes must be string[]' }
    }
    if (!isPermissionAction(raw.permission_action) && raw.permission_action !== 'deny') {
      return { ok: false, error: 'audit.permission_decided.permission_action is invalid' }
    }
    if (raw.reason_code !== undefined && typeof raw.reason_code !== 'string') {
      return { ok: false, error: 'audit.permission_decided.reason_code must be string when provided' }
    }
    if (typeof raw.mode !== 'string' || raw.mode.length === 0) {
      return { ok: false, error: 'audit.permission_decided.mode is required' }
    }
    if (
      !Array.isArray(raw.matched_rule_ids) ||
      !raw.matched_rule_ids.every((item) => typeof item === 'string')
    ) {
      return { ok: false, error: 'audit.permission_decided.matched_rule_ids must be string[]' }
    }

    return {
      ok: true,
      event: {
        ...base.event,
        risk_level: raw.risk_level,
        baseline_level: raw.baseline_level,
        reason_codes: raw.reason_codes,
        permission_action: raw.permission_action,
        reason_code: raw.reason_code,
        mode: raw.mode,
        matched_rule_ids: raw.matched_rule_ids,
      } as AuditPermissionDecidedEvent,
    }
  }

  if (type === 'audit.execution_started') {
    return {
      ok: true,
      event: base.event as AuditExecutionStartedEvent,
    }
  }

  if (typeof raw.success !== 'boolean') {
    return { ok: false, error: 'audit.execution_finished.success must be boolean' }
  }
  if (!isExecutionResult(raw.result)) {
    return { ok: false, error: 'audit.execution_finished.result is invalid' }
  }
  if (typeof raw.ended_at !== 'string' || raw.ended_at.length === 0) {
    return { ok: false, error: 'audit.execution_finished.ended_at is required' }
  }
  if (
    typeof raw.duration_ms !== 'number' ||
    Number.isNaN(raw.duration_ms) ||
    raw.duration_ms < 0
  ) {
    return { ok: false, error: 'audit.execution_finished.duration_ms must be non-negative number' }
  }
  if (raw.reason_code !== undefined && typeof raw.reason_code !== 'string') {
    return { ok: false, error: 'audit.execution_finished.reason_code must be string when provided' }
  }
  if (raw.error_message !== undefined && typeof raw.error_message !== 'string') {
    return { ok: false, error: 'audit.execution_finished.error_message must be string when provided' }
  }

  return {
    ok: true,
    event: {
      ...base.event,
      success: raw.success,
      result: raw.result,
      ended_at: raw.ended_at,
      duration_ms: raw.duration_ms,
      reason_code: raw.reason_code,
      error_message: raw.error_message,
    } as AuditExecutionFinishedEvent,
  }
}

function createBase<TType extends AuditEventType>(
  input: AuditEventBaseInput,
  type: TType,
): AuditEventBase & { type: TType } {
  const event: AuditEventBase & { type: TType } = {
    ts: input.timestamp || new Date().toISOString(),
    type,
    session_id: input.sessionId,
    trace_id: input.traceId,
    request_id: input.requestId,
    tool_name: input.toolName,
    seq: input.seq,
  }
  if (input.turnId) {
    event.turn_id = input.turnId
  }
  return event
}

function parseBase<TType extends AuditEventType>(
  raw: Record<string, unknown>,
  type: TType,
): AuditParseResult<AuditEventBase & { type: TType }> {
  if (typeof raw.ts !== 'string' || raw.ts.length === 0) {
    return { ok: false, error: `${type}.ts is required` }
  }
  if (typeof raw.session_id !== 'string' || raw.session_id.length === 0) {
    return { ok: false, error: `${type}.session_id is required` }
  }
  if (typeof raw.trace_id !== 'string' || raw.trace_id.length === 0) {
    return { ok: false, error: `${type}.trace_id is required` }
  }
  if (typeof raw.request_id !== 'string' || raw.request_id.length === 0) {
    return { ok: false, error: `${type}.request_id is required` }
  }
  if (typeof raw.tool_name !== 'string' || raw.tool_name.length === 0) {
    return { ok: false, error: `${type}.tool_name is required` }
  }
  if (typeof raw.seq !== 'number' || Number.isNaN(raw.seq) || raw.seq <= 0) {
    return { ok: false, error: `${type}.seq must be a positive number` }
  }
  if (raw.turn_id !== undefined && (typeof raw.turn_id !== 'string' || raw.turn_id.length === 0)) {
    return { ok: false, error: `${type}.turn_id must be non-empty string when provided` }
  }

  return {
    ok: true,
    event: {
      ts: raw.ts,
      type,
      session_id: raw.session_id,
      trace_id: raw.trace_id,
      turn_id: raw.turn_id as string | undefined,
      request_id: raw.request_id,
      tool_name: raw.tool_name,
      seq: raw.seq,
    },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isAuditEventType(value: unknown): value is AuditEventType {
  return (
    value === 'audit.requested' ||
    value === 'audit.permission_decided' ||
    value === 'audit.execution_started' ||
    value === 'audit.execution_finished'
  )
}

function isExecutionResult(value: unknown): value is 'success' | 'denied' | 'error' {
  return value === 'success' || value === 'denied' || value === 'error'
}

function isPermissionAction(value: unknown): value is PermissionAction {
  return value === 'allow' || value === 'ask' || value === 'deny'
}

function isToolRiskLevel(value: unknown): value is ToolRiskLevel {
  return value === 'low' || value === 'medium' || value === 'high' || value === 'critical'
}
