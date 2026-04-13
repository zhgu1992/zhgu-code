import { createSpanId } from '../../../observability/ids.js'
import { getTraceBus } from '../../../observability/trace-bus.js'
import type { TraceStatus } from '../../../observability/trace-model.js'
import type {
  McpErrorClassification,
  McpLifecycleAuditEvent,
  McpLifecycleManager,
  McpLifecycleSnapshot,
  McpLifecycleState,
  McpLifecycleTransition,
  McpStructuredReason,
} from './types.js'

export interface CreateMcpLifecycleManagerOptions {
  providerId: string
  sessionId: string
  traceId: string
  connect: () => Promise<void>
  module?: string
  maxRetries?: number
  retryDelayMs?: number
  classifyError?: (error: unknown) => McpErrorClassification
  onTransition?: (transition: McpLifecycleTransition) => void
  onAudit?: (event: McpLifecycleAuditEvent) => void
}

const DEFAULT_MAX_RETRIES = 2
const DEFAULT_MODULE = 'platform.integration.mcp.lifecycle'

export function createMcpLifecycleManager(
  options: CreateMcpLifecycleManagerOptions,
): McpLifecycleManager {
  const moduleName = options.module ?? DEFAULT_MODULE
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES
  const retryDelayMs = options.retryDelayMs ?? 0

  let state: McpLifecycleState = 'disconnected'
  let attempt = 0
  let lastReason: McpStructuredReason | undefined

  function nowIso(): string {
    return new Date().toISOString()
  }

  function snapshot(): McpLifecycleSnapshot {
    return {
      providerId: options.providerId,
      state,
      attempt,
      updatedAt: nowIso(),
      lastReason,
    }
  }

  function toStructuredReason(
    reason: Omit<McpStructuredReason, 'source' | 'module'>,
  ): McpStructuredReason {
    return {
      source: 'mcp',
      module: moduleName,
      reasonCode: reason.reasonCode,
      userMessage: reason.userMessage,
      retryable: reason.retryable,
      detail: reason.detail,
    }
  }

  function emit(from: McpLifecycleState, to: McpLifecycleState, reason?: McpStructuredReason): void {
    const transition: McpLifecycleTransition = {
      ts: nowIso(),
      providerId: options.providerId,
      from,
      to,
      attempt,
      reason,
    }

    options.onTransition?.(transition)

    const auditEvent: McpLifecycleAuditEvent = {
      ts: transition.ts,
      source: 'mcp',
      module: moduleName,
      providerId: options.providerId,
      event: 'mcp.lifecycle.transition',
      from,
      to,
      attempt,
      reason,
    }
    options.onAudit?.(auditEvent)

    const status: TraceStatus = to === 'degraded' ? 'error' : to === 'disabled' ? 'timeout' : 'ok'
    getTraceBus().emit({
      stage: 'provider',
      event: 'mcp_lifecycle_transition',
      status,
      session_id: options.sessionId,
      trace_id: options.traceId,
      span_id: createSpanId(),
      payload: {
        providerId: options.providerId,
        module: moduleName,
        from,
        to,
        attempt,
        reason,
      },
    })
  }

  function transition(next: McpLifecycleState, reason?: McpStructuredReason): void {
    const previous = state
    state = next
    if (reason) {
      lastReason = reason
    }
    emit(previous, next, reason)
  }

  function classify(error: unknown): McpErrorClassification {
    if (options.classifyError) {
      return options.classifyError(error)
    }

    const message = error instanceof Error ? error.message : String(error)
    return {
      reasonCode: 'connect_failed',
      userMessage: 'MCP connection failed. Please retry later.',
      retryable: true,
      detail: message,
    }
  }

  async function waitDelay(ms: number): Promise<void> {
    if (ms <= 0) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, ms))
  }

  return {
    async connect(): Promise<McpLifecycleSnapshot> {
      if (state === 'disabled') {
        return snapshot()
      }

      transition('connecting')
      for (let currentAttempt = 1; currentAttempt <= maxRetries + 1; currentAttempt += 1) {
        attempt = currentAttempt
        try {
          await options.connect()
          lastReason = undefined
          transition('ready')
          return snapshot()
        } catch (error) {
          const classified = classify(error)
          const reason = toStructuredReason(classified)

          if (!classified.retryable) {
            transition('disabled', reason)
            return snapshot()
          }

          transition('degraded', reason)
          if (currentAttempt > maxRetries) {
            transition(
              'disabled',
              toStructuredReason({
                reasonCode: 'retry_exhausted',
                userMessage: 'MCP connection retries exhausted and has been disabled.',
                retryable: false,
                detail: reason.detail,
              }),
            )
            return snapshot()
          }
          transition('connecting', reason)
          await waitDelay(retryDelayMs)
        }
      }

      transition(
        'disabled',
        toStructuredReason({
          reasonCode: 'unexpected_state',
          userMessage: 'MCP lifecycle reached an unexpected state.',
          retryable: false,
        }),
      )
      return snapshot()
    },

    disable(reason): McpLifecycleSnapshot {
      const resolvedReason = reason
        ? toStructuredReason(reason)
        : toStructuredReason({
            reasonCode: 'manually_disabled',
            userMessage: 'MCP connection was manually disabled.',
            retryable: false,
          })
      transition('disabled', resolvedReason)
      return snapshot()
    },

    getSnapshot(): McpLifecycleSnapshot {
      return snapshot()
    },

    canSchedule(): boolean {
      return state !== 'disabled'
    },
  }
}
