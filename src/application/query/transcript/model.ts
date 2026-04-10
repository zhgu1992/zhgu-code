import type { Message, MessageContent } from '../../../definitions/types/index.js'

export type TranscriptEventType = 'session_start' | 'message_append' | 'session_end'

export interface TranscriptEventBase {
  ts: string
  type: TranscriptEventType
  session_id: string
  trace_id: string
  turn_id?: string
}

export interface TranscriptSessionStartEvent extends TranscriptEventBase {
  type: 'session_start'
  model: string
  cwd: string
}

export interface TranscriptMessageAppendEvent extends TranscriptEventBase {
  type: 'message_append'
  message_id: string
  role: Message['role']
  content: MessageContent
  is_tool_result: boolean
}

export interface TranscriptSessionEndEvent extends TranscriptEventBase {
  type: 'session_end'
  reason?: string
  duration_ms?: number
}

export type TranscriptEvent =
  | TranscriptSessionStartEvent
  | TranscriptMessageAppendEvent
  | TranscriptSessionEndEvent

type ParseOk<T> = {
  ok: true
  event: T
}

type ParseErr = {
  ok: false
  error: string
}

export type TranscriptParseResult<T = TranscriptEvent> = ParseOk<T> | ParseErr
type TranscriptEventBaseOf<T extends TranscriptEventType> = TranscriptEventBase & { type: T }

interface TranscriptEventBaseInput {
  sessionId: string
  traceId: string
  turnId?: string
  timestamp?: string
}

interface CreateSessionStartInput extends TranscriptEventBaseInput {
  model: string
  cwd: string
}

interface CreateMessageAppendInput extends TranscriptEventBaseInput {
  messageId: string
  role: Message['role']
  content: MessageContent
  isToolResult?: boolean
}

interface CreateSessionEndInput extends TranscriptEventBaseInput {
  reason?: string
  durationMs?: number
}

export function createSessionStartEvent(
  input: CreateSessionStartInput,
): TranscriptSessionStartEvent {
  return {
    ...createBase(input, 'session_start'),
    model: input.model,
    cwd: input.cwd,
  }
}

export function createMessageAppendEvent(
  input: CreateMessageAppendInput,
): TranscriptMessageAppendEvent {
  return {
    ...createBase(input, 'message_append'),
    message_id: input.messageId,
    role: input.role,
    content: input.content,
    is_tool_result: input.isToolResult === true,
  }
}

export function createSessionEndEvent(
  input: CreateSessionEndInput,
): TranscriptSessionEndEvent {
  const event: TranscriptSessionEndEvent = {
    ...createBase(input, 'session_end'),
  }
  if (input.reason) {
    event.reason = input.reason
  }
  if (input.durationMs !== undefined) {
    event.duration_ms = input.durationMs
  }
  return event
}

export function parseTranscriptEvent(raw: unknown): TranscriptParseResult {
  if (!isRecord(raw)) {
    return { ok: false, error: 'event must be an object' }
  }

  const type = raw.type
  if (!isTranscriptEventType(type)) {
    return { ok: false, error: 'event.type is invalid' }
  }

  if (type === 'session_start') {
    const base = parseBase(raw, 'session_start')
    if (!base.ok) {
      return base
    }

    if (typeof raw.model !== 'string' || raw.model.length === 0) {
      return { ok: false, error: 'session_start.model is required' }
    }
    if (typeof raw.cwd !== 'string' || raw.cwd.length === 0) {
      return { ok: false, error: 'session_start.cwd is required' }
    }

    return {
      ok: true,
      event: {
        ...base.event,
        model: raw.model,
        cwd: raw.cwd,
      },
    }
  }

  if (type === 'message_append') {
    const base = parseBase(raw, 'message_append')
    if (!base.ok) {
      return base
    }

    if (typeof raw.message_id !== 'string' || raw.message_id.length === 0) {
      return { ok: false, error: 'message_append.message_id is required' }
    }
    if (!isMessageRole(raw.role)) {
      return { ok: false, error: 'message_append.role is invalid' }
    }
    if (!isMessageContent(raw.content)) {
      return { ok: false, error: 'message_append.content is invalid' }
    }
    if (typeof raw.is_tool_result !== 'boolean') {
      return { ok: false, error: 'message_append.is_tool_result must be boolean' }
    }

    return {
      ok: true,
      event: {
        ...base.event,
        message_id: raw.message_id,
        role: raw.role,
        content: raw.content,
        is_tool_result: raw.is_tool_result,
      },
    }
  }

  const base = parseBase(raw, 'session_end')
  if (!base.ok) {
    return base
  }

  if (raw.reason !== undefined && typeof raw.reason !== 'string') {
    return { ok: false, error: 'session_end.reason must be string when provided' }
  }
  if (
    raw.duration_ms !== undefined &&
    (typeof raw.duration_ms !== 'number' || Number.isNaN(raw.duration_ms) || raw.duration_ms < 0)
  ) {
    return { ok: false, error: 'session_end.duration_ms must be a non-negative number' }
  }

  return {
    ok: true,
    event: {
      ...base.event,
      reason: raw.reason,
      duration_ms: raw.duration_ms,
    },
  }
}

function createBase<T extends TranscriptEventType>(
  input: TranscriptEventBaseInput,
  type: T,
): TranscriptEventBaseOf<T> {
  const event: TranscriptEventBaseOf<T> = {
    ts: input.timestamp || new Date().toISOString(),
    type,
    session_id: input.sessionId,
    trace_id: input.traceId,
  }

  if (input.turnId) {
    event.turn_id = input.turnId
  }

  return event
}

function parseBase<T extends TranscriptEventType>(
  raw: Record<string, unknown>,
  type: T,
): TranscriptParseResult<TranscriptEventBaseOf<T>> {
  if (typeof raw.ts !== 'string' || raw.ts.length === 0) {
    return { ok: false, error: `${type}.ts is required` }
  }
  if (typeof raw.session_id !== 'string' || raw.session_id.length === 0) {
    return { ok: false, error: `${type}.session_id is required` }
  }
  if (typeof raw.trace_id !== 'string' || raw.trace_id.length === 0) {
    return { ok: false, error: `${type}.trace_id is required` }
  }
  if (raw.turn_id !== undefined && (typeof raw.turn_id !== 'string' || raw.turn_id.length === 0)) {
    return { ok: false, error: `${type}.turn_id must be a non-empty string when provided` }
  }

  return {
    ok: true,
    event: {
      ts: raw.ts,
      type,
      session_id: raw.session_id,
      trace_id: raw.trace_id,
      turn_id: raw.turn_id as string | undefined,
    },
  }
}

function isTranscriptEventType(value: unknown): value is TranscriptEventType {
  return value === 'session_start' || value === 'message_append' || value === 'session_end'
}

function isMessageRole(value: unknown): value is Message['role'] {
  return value === 'user' || value === 'assistant' || value === 'system'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isMessageContent(value: unknown): value is MessageContent {
  if (typeof value === 'string') {
    return true
  }
  if (!Array.isArray(value)) {
    return false
  }

  return value.every((block) => {
    if (!isRecord(block)) {
      return false
    }
    return typeof block.type === 'string' && block.type.length > 0
  })
}
