import { randomUUID } from 'node:crypto'

export function createSessionId(): string {
  return `sess_${randomUUID()}`
}

export function createTraceId(): string {
  return `trace_${randomUUID()}`
}

export function createTurnId(): string {
  return `turn_${randomUUID()}`
}

export function createSpanId(): string {
  return `span_${randomUUID()}`
}
