import type { ContentBlock } from '../../definitions/types/index.js'
import { createSpanId } from '../../observability/ids.js'
import { getTraceBus } from '../../observability/trace-bus.js'
import type { AppStore } from '../../state/store.js'
import { executeTool } from '../../tools/executor.js'
import { getTools } from '../../tools/registry.js'
import { createIntegrationRegistryAdapter } from '../../platform/integration/registry/adapter.js'
import { buildRuntimeIntegrationRegistryInput } from '../../platform/integration/runtime-input.js'
import type { TurnStateMachine } from './turn-state.js'
import { classifyToolResult } from './errors.js'
import { createRecoveryEventPayload, decideRecovery, sleep } from './recovery.js'
import {
  evaluateTaskAdmission,
  evaluateToolCallApproval,
  createTaskLifecycleModel,
  type ApprovalAuditEvent,
} from '../orchestrator/index.js'
import type { ActivePlanContextSnapshot } from '../orchestrator/runtime-session.js'

export interface ToolCall {
  id: string
  name: string
  input: unknown
}

export type ToolOrchestrationResult = 'handoff' | 'stopped'

interface ExecuteToolAndPersistArgs {
  store: AppStore
  call: ToolCall
  orchestratorContext?: {
    turnId?: string
    planId: string
    taskId: string
  }
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
  const orchestrationLink = resolveOrchestrationLink({
    sessionId: state.sessionId,
    mode: state.permissionMode,
    activePlan: state.orchestratorRuntimeSession.activePlan,
    fallbackTaskId: call.id,
    context: args.orchestratorContext,
  })
  const taskLifecycle = createTaskLifecycleModel({
    taskId: orchestrationLink.taskId,
    title: `tool:${call.name}`,
  })
  taskLifecycle.transition('start')
  const integrationRegistry = createIntegrationRegistryAdapter({
    sessionId: state.sessionId,
    traceId: state.traceId,
  })
  const integrationInput = await buildRuntimeIntegrationRegistryInput({
    cwd: state.cwd,
    sessionId: state.sessionId,
    traceId: state.traceId,
  })
  integrationRegistry.rebuild(integrationInput)
  const callResolution = integrationRegistry.resolveToolCall(call.name)
  if (!callResolution.callable) {
    const errorPayload = JSON.stringify(callResolution.reason)
    if (
      state.permissionMode === 'ask' &&
      turnStateMachine.getSnapshot().state === 'awaiting-permission'
    ) {
      turnStateMachine.transition({ type: 'permission_denied' })
    }
    traceBus.emit({
      stage: 'query',
      event: 'registry_not_callable',
      status: 'error',
      session_id: state.sessionId,
      trace_id: state.traceId,
      turn_id: state.currentTurnId ?? undefined,
      span_id: createSpanId(),
      payload: {
        toolName: call.name,
        planId: orchestrationLink.planId,
        taskId: orchestrationLink.taskId,
        capabilityId: callResolution.capability?.capabilityId,
        reason: callResolution.reason,
      },
    })
    state.setError(`Error: ${errorPayload}`)
    taskLifecycle.transition('fail', 'runtime_error')
    return 'stopped'
  }

  const approvalContext = buildApprovalContext(
    state.sessionId,
    state.permissionMode,
    state.orchestratorRuntimeSession.activePlan,
    orchestrationLink.planId,
  )
  const taskAdmission = evaluateTaskAdmission(approvalContext, {
    taskId: orchestrationLink.taskId,
  })
  emitApprovalAuditEvents({
    traceBus,
    sessionId: state.sessionId,
    traceId: state.traceId,
    turnId: state.currentTurnId ?? undefined,
    toolName: call.name,
    events: taskAdmission.auditEvents,
  })

  if (!taskAdmission.allowed) {
    const result = formatApprovalDeniedResult(
      taskAdmission.reasonCode,
      `Task ${orchestrationLink.taskId} is not admitted`,
      {
        planId: orchestrationLink.planId,
        taskId: orchestrationLink.taskId,
        toolName: call.name,
        effectiveMode: taskAdmission.effectiveMode,
      },
    )
    state.setError(result)
    taskLifecycle.transition('fail', 'permission_denied')
    return 'stopped'
  }

  const toolApproval = evaluateToolCallApproval(approvalContext, {
    taskId: orchestrationLink.taskId,
    toolName: call.name,
  })
  emitApprovalAuditEvents({
    traceBus,
    sessionId: state.sessionId,
    traceId: state.traceId,
    turnId: state.currentTurnId ?? undefined,
    toolName: call.name,
    events: toolApproval.auditEvents,
  })

  if (!toolApproval.allowed) {
    const result = formatApprovalDeniedResult(
      toolApproval.reasonCode,
      `Tool ${call.name} is blocked by orchestrator approval`,
      {
        planId: orchestrationLink.planId,
        taskId: orchestrationLink.taskId,
        toolName: call.name,
        effectiveMode: toolApproval.effectiveMode,
        driftDetected: toolApproval.driftDetected,
      },
    )
    state.setError(result)
    taskLifecycle.transition('fail', 'permission_denied')
    return 'stopped'
  }

  const tool = getTools().get(call.name)
  const safeToRetry = tool?.safeToRetry === true
  let attempt = 0

  state.setStreamingText(`🔧 Executing: ${call.name}...`)
  while (true) {
    const result = await executeTool(call.name, call.input, store)
    const deniedByUser = isToolPermissionDenied(result, call.name)

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
      taskLifecycle.transition('fail', 'permission_denied')
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
        planId: orchestrationLink.planId,
        taskId: orchestrationLink.taskId,
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
      taskLifecycle.transition('fail', 'runtime_error')
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
    taskLifecycle.transition('complete')
    return 'handoff'
  }
}

function isToolPermissionDenied(result: string, toolName: string): boolean {
  const normalized = result.toLowerCase()
  return (
    result.startsWith(`Tool ${toolName} was denied by user`) ||
    normalized.includes('permission denied')
  )
}

function buildApprovalContext(
  sessionId: string,
  mode: 'ask' | 'auto' | 'plan',
  activePlan: ActivePlanContextSnapshot | null,
  preferredPlanId?: string,
): {
  planId: string
  planMode: 'ask' | 'auto' | 'plan'
  planApprovalStatus: 'pending' | 'approved' | 'rejected'
} {
  if (activePlan) {
    return {
      planId: activePlan.planId,
      planMode: activePlan.planMode,
      planApprovalStatus: activePlan.planApprovalStatus,
    }
  }

  return {
    planId: preferredPlanId ?? `plan_${sessionId}`,
    planMode: mode,
    planApprovalStatus: mode === 'plan' ? 'pending' : 'approved',
  }
}

function resolveOrchestrationLink(args: {
  sessionId: string
  mode: 'ask' | 'auto' | 'plan'
  activePlan: ActivePlanContextSnapshot | null
  fallbackTaskId: string
  context?: {
    turnId?: string
    planId: string
    taskId: string
  }
}): { turnId?: string; planId: string; taskId: string } {
  if (args.context) {
    return {
      turnId: args.context.turnId,
      planId: args.context.planId,
      taskId: args.context.taskId,
    }
  }

  if (args.activePlan) {
    return {
      planId: args.activePlan.planId,
      taskId: args.fallbackTaskId,
    }
  }

  return {
    planId: `plan_${args.sessionId}`,
    taskId: args.fallbackTaskId,
  }
}

function emitApprovalAuditEvents(args: {
  traceBus: ReturnType<typeof getTraceBus>
  sessionId: string
  traceId: string
  turnId?: string
  toolName: string
  events: ApprovalAuditEvent[]
}): void {
  for (const event of args.events) {
    args.traceBus.emit({
      stage: 'query',
      event: 'orchestrator_approval',
      status:
        event.event === 'task_rejected' || event.event === 'tool_call_denied' ? 'error' : 'ok',
      session_id: args.sessionId,
      trace_id: args.traceId,
      turn_id: args.turnId,
      span_id: createSpanId(),
      payload: {
        toolName: args.toolName,
        approvalEvent: event.event,
        planId: event.planId,
        taskId: event.taskId,
        reasonCode: event.reasonCode,
        effectiveMode: event.effectiveMode,
        eventSeq: event.eventSeq,
      },
    })
  }
}

function formatApprovalDeniedResult(
  reasonCode: string,
  userMessage: string,
  meta: Record<string, unknown>,
): string {
  return [
    `Error: permission denied (${reasonCode})`,
    userMessage,
    JSON.stringify({ reasonCode, userMessage, meta }),
  ].join('\n')
}
