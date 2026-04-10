import type { ContentBlock } from '../../definitions/types/index.js'
import { createSpanId } from '../../observability/ids.js'
import { getTraceBus } from '../../observability/trace-bus.js'
import type { AppStore } from '../../state/store.js'
import { executeTool } from '../../tools/executor.js'
import { getTools } from '../../tools/registry.js'
import type { TurnStateMachine } from './turn-state.js'
import { classifyToolResult } from './errors.js'
import { createRecoveryEventPayload, decideRecovery, sleep } from './recovery.js'

export interface ToolCall {
  id: string
  name: string
  input: unknown
}

export type ToolOrchestrationResult = 'handoff' | 'stopped'

interface ExecuteToolAndPersistArgs {
  store: AppStore
  call: ToolCall
  assistantContent: ContentBlock[]
  turnStateMachine: TurnStateMachine
  recoveryBudget: {
    currentTotalAttempt: () => number
    incrementTotalAttempt: () => void
    maxTotalAttempts: number
  }
}

export async function executeToolAndPersist(
  args: ExecuteToolAndPersistArgs,
): Promise<ToolOrchestrationResult> {
  const { store, call, assistantContent, turnStateMachine, recoveryBudget } = args
  const state = store.getState()
  const traceBus = getTraceBus()
  const tool = getTools().get(call.name)
  const safeToRetry = tool?.safeToRetry === true
  let attempt = 0

  state.setStreamingText(`🔧 Executing: ${call.name}...`)
  while (true) {
    const result = await executeTool(call.name, call.input, store)
    const deniedByUser = isToolDeniedByUser(result, call.name)

    if (
      state.permissionMode === 'ask' &&
      turnStateMachine.getSnapshot().state === 'awaiting-permission'
    ) {
      turnStateMachine.transition({
        type: deniedByUser ? 'permission_denied' : 'permission_approved',
      })
    }

    if (deniedByUser) {
      state.setError(result)
      return 'stopped'
    }

    const classifiedToolError = classifyToolResult(result)
    if (classifiedToolError) {
      const decision = decideRecovery({
        errorClass: classifiedToolError.errorClass,
        errorSubclass: classifiedToolError.errorSubclass,
        source: 'tool',
        attempt,
        totalAttempt: recoveryBudget.currentTotalAttempt(),
        maxTotalAttempts: recoveryBudget.maxTotalAttempts,
        safeToRetry,
      })

      const basePayload = {
        ...createRecoveryEventPayload({
          source: 'tool',
          errorClass: classifiedToolError.errorClass,
          errorSubclass: classifiedToolError.errorSubclass,
          action: decision.action,
          attempt,
          maxAttempts: decision.maxAttempts,
          backoffMs: decision.backoffMs,
          blockedByIdempotency: decision.blockedByIdempotency,
        }),
        tool_name: call.name,
      }

      traceBus.emit({
        stage: 'query',
        event: 'recovery_started',
        status: decision.action === 'retry' ? 'ok' : 'error',
        session_id: state.sessionId,
        trace_id: state.traceId,
        turn_id: state.currentTurnId ?? undefined,
        span_id: createSpanId(),
        payload: basePayload,
      })

      if (decision.action === 'retry') {
        traceBus.emit({
          stage: 'query',
          event: 'retry_scheduled',
          status: 'ok',
          session_id: state.sessionId,
          trace_id: state.traceId,
          turn_id: state.currentTurnId ?? undefined,
          span_id: createSpanId(),
          payload: basePayload,
        })
        turnStateMachine.transition({ type: 'recoverable_error' })
        await sleep(decision.backoffMs)
        recoveryBudget.incrementTotalAttempt()
        turnStateMachine.transition({ type: 'recovery_succeeded' })
        traceBus.emit({
          stage: 'query',
          event: 'retry_succeeded',
          status: 'ok',
          session_id: state.sessionId,
          trace_id: state.traceId,
          turn_id: state.currentTurnId ?? undefined,
          span_id: createSpanId(),
          payload: {
            ...basePayload,
            attempt: attempt + 1,
          },
        })
        turnStateMachine.transition({ type: 'tool_use_detected', toolMode: 'auto' })
        attempt += 1
        state.setStreamingText(`🔁 Retrying tool: ${call.name} (${attempt}/${decision.maxAttempts})`)
        continue
      }

      if (decision.event === 'retry_exhausted') {
        traceBus.emit({
          stage: 'query',
          event: 'retry_exhausted',
          status: 'error',
          session_id: state.sessionId,
          trace_id: state.traceId,
          turn_id: state.currentTurnId ?? undefined,
          span_id: createSpanId(),
          payload: basePayload,
        })
        turnStateMachine.transition({ type: 'recoverable_error' })
        turnStateMachine.transition({ type: 'retry_exhausted' })
      } else if (decision.event === 'fatal_error') {
        traceBus.emit({
          stage: 'query',
          event: 'recovery_stopped',
          status: 'error',
          session_id: state.sessionId,
          trace_id: state.traceId,
          turn_id: state.currentTurnId ?? undefined,
          span_id: createSpanId(),
          payload: basePayload,
        })
        turnStateMachine.transition({ type: 'fatal_error' })
      } else {
        traceBus.emit({
          stage: 'query',
          event: 'recovery_stopped',
          status: 'error',
          session_id: state.sessionId,
          trace_id: state.traceId,
          turn_id: state.currentTurnId ?? undefined,
          span_id: createSpanId(),
          payload: basePayload,
        })
      }
      state.setError(classifiedToolError.message)
      return 'stopped'
    }

    assistantContent.push({
      type: 'tool_use',
      id: call.id,
      name: call.name,
      input: call.input,
    })

    // Internal message chain for model continuation.
    state.addMessage({
      role: 'assistant',
      content: assistantContent,
      isToolResult: true,
    })
    state.addMessage({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: call.id,
          content: result,
        },
      ],
      isToolResult: true,
    })

    turnStateMachine.transition({ type: 'tool_result_written' })
    state.setStreamingText('🔄 Processing response...')
    return 'handoff'
  }
}

function isToolDeniedByUser(result: string, toolName: string): boolean {
  return result.startsWith(`Tool ${toolName} was denied by user`)
}
