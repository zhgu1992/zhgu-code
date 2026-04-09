import { stream } from '../../api/client.js'
import type { QueryOptions } from '../../architecture/contracts/query-engine.js'
import type { Context } from '../../core/context.js'
import { buildSystemPrompt } from '../../core/prompt.js'
import type { Message } from '../../definitions/types/index.js'
import { createSpanId, createTurnId } from '../../observability/ids.js'
import { getTraceBus } from '../../observability/trace-bus.js'
import type { AppStore } from '../../state/store.js'
import { getTools } from '../../tools/registry.js'
import {
  createTurnStateMachine,
  IllegalTurnTransitionError,
} from './turn-state.js'
import { consumeStreamEvents, applyTextChunk, applyThinkingChunk } from './stream-consumer.js'
import { executeToolAndPersist } from './tool-orchestrator.js'
import {
  estimateContextTokens,
  estimateTokensFromText,
  evaluateBudget,
  formatBudgetExceededMessage,
  type BudgetExceeded,
} from './budget.js'

export async function runQuery(store: AppStore, options?: QueryOptions): Promise<void> {
  const state = store.getState()
  const traceBus = getTraceBus()
  const turnId = createTurnId()
  const turnSpanId = createSpanId()
  const providerSpanId = createSpanId()
  const turnStart = Date.now()

  let turnStatus: 'ok' | 'error' = 'ok'
  let errorMessage: string | undefined
  let handoffToNextTurn = false
  let budgetStopped = false

  const turnStateMachine = createTurnStateMachine({
    onTransition: (transition) => {
      store.getState().applyTurnTransition(transition)
      options?.onTurnTransition?.(transition)
    },
  })
  turnStateMachine.transition({ type: 'turn_start', turnId })

  emitTurnStartTrace({
    traceBus,
    state,
    options,
    turnId,
    turnSpanId,
  })

  const tools = getTools()
  const quiet = options?.quiet ?? state.quiet
  const emitStdout = options?.emitStdout ?? true
  const messages = state.messages.map(formatMessageForAPI)
  const systemPrompt = buildSystemPrompt(resolveContext(state.context, state.cwd))
  const budget = options?.budget

  const stopForBudget = (exceeded: BudgetExceeded): 'stopped' => {
    if (budgetStopped) {
      return 'stopped'
    }
    budgetStopped = true
    turnStatus = 'error'
    errorMessage = formatBudgetExceededMessage(exceeded)

    traceBus.emit({
      stage: 'query',
      event: 'budget_exceeded',
      status: 'error',
      session_id: state.sessionId,
      trace_id: state.traceId,
      turn_id: turnId,
      span_id: createSpanId(),
      parent_span_id: turnSpanId,
      payload: {
        metric: exceeded.metric,
        limit: exceeded.limit,
        actual: exceeded.actual,
        estimated: exceeded.estimated,
      },
    })

    try {
      turnStateMachine.transition({ type: 'budget_exceeded' })
    } catch (transitionError) {
      if (!(transitionError instanceof IllegalTurnTransitionError)) {
        throw transitionError
      }
    }

    state.setError(errorMessage)
    return 'stopped'
  }

  const contextBudgetCheck = evaluateBudget(budget, {
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      contextTokens: estimateContextTokens(systemPrompt, state.messages),
    },
    estimated: { contextTokensEstimated: true },
  })
  if (contextBudgetCheck) {
    stopForBudget(contextBudgetCheck)
    return
  }

  state.setStreamingText('Connecting...')
  state.setThinking(null)
  state.startStreaming()
  state.setError(null)

  try {
    const streamIterator = stream(
      {
        model: state.model,
        max_tokens: 4096,
        system: systemPrompt,
        messages,
        tools: tools.toAPISchema(),
      },
      createProviderHooks({
        traceBus,
        state,
        turnId,
        turnSpanId,
        providerSpanId,
      }),
    )

    const consumerState = {
      assistantContent: [] as import('../../definitions/types/index.js').ContentBlock[],
      currentText: '',
      currentThinking: '',
      currentTool: null as { id: string; name: string; input: unknown } | null,
    }

    const outcome = await consumeStreamEvents(streamIterator, consumerState, {
      onThinkingChunk: (chunk, s) => {
        applyThinkingChunk(s, chunk)
        state.setThinking(s.currentThinking)
      },
      onTextChunk: (chunk, s) => {
        applyTextChunk(s, chunk)
        state.setStreamingText(s.currentText)
        const outputBudgetCheck = evaluateBudget(budget, {
          usage: {
            inputTokens: 0,
            outputTokens: estimateTokensFromText(s.currentText),
            contextTokens: 0,
          },
          estimated: { outputTokensEstimated: true },
        })
        if (outputBudgetCheck) {
          return stopForBudget(outputBudgetCheck)
        }
        if (!quiet && emitStdout) {
          process.stdout.write(chunk)
        }
      },
      onToolUseStart: (event, s) => {
        s.currentTool = { id: event.id, name: event.name, input: {} }
        turnStateMachine.transition({
          type: 'tool_use_detected',
          toolMode: state.permissionMode === 'ask' ? 'ask' : 'auto',
        })
        state.setStreamingText(`🔧 Tool: ${event.name}`)
        if (!quiet && emitStdout) {
          console.log(`\n🔧 Tool: ${event.name}`)
        }
      },
      onToolInputComplete: async (event, s) => {
        if (!s.currentTool || !s.currentTool.id) {
          return 'completed'
        }

        s.currentTool.input = event.input
        const result = await executeToolAndPersist({
          store,
          call: {
            id: s.currentTool.id,
            name: s.currentTool.name,
            input: s.currentTool.input,
          },
          assistantContent: s.assistantContent,
          turnStateMachine,
        })

        return result
      },
      onLegacyToolUse: async (event, s) => {
        turnStateMachine.transition({
          type: 'tool_use_detected',
          toolMode: state.permissionMode === 'ask' ? 'ask' : 'auto',
        })
        if (!quiet && emitStdout) {
          console.log(`\n🔧 Tool: ${event.name}`)
        }
        return executeToolAndPersist({
          store,
          call: { id: event.id, name: event.name, input: event.input },
          assistantContent: s.assistantContent,
          turnStateMachine,
        })
      },
      onDone: (event, s) => {
        const hasProviderUsage =
          event.inputTokens !== undefined || event.outputTokens !== undefined

        if (hasProviderUsage) {
          const currentState = store.getState()
          currentState.setTokenUsage(
            currentState.inputTokens + (event.inputTokens ?? 0),
            currentState.outputTokens + (event.outputTokens ?? 0),
          )
        }

        const doneBudgetCheck = evaluateBudget(budget, {
          usage: {
            inputTokens: event.inputTokens ?? 0,
            outputTokens: event.outputTokens ?? estimateTokensFromText(s.currentText),
            contextTokens: 0,
          },
          estimated: {
            inputTokensEstimated: event.inputTokens === undefined,
            outputTokensEstimated: event.outputTokens === undefined,
          },
        })
        if (doneBudgetCheck) {
          return stopForBudget(doneBudgetCheck)
        }

        turnStateMachine.transition({ type: 'assistant_done' })

        const hasTextContent = s.assistantContent.some((block) => block.type === 'text')
        if (hasTextContent || s.currentThinking) {
          if (!quiet && emitStdout) {
            console.log('')
          }

          const finalContent: import('../../definitions/types/index.js').ContentBlock[] = []
          if (s.currentThinking) {
            finalContent.push({ type: 'thinking', thinking: s.currentThinking })
          }
          finalContent.push(...s.assistantContent)
          state.addMessage({
            role: 'assistant',
            content: finalContent,
          })
        }
        return 'completed'
      },
    })

    if (outcome === 'handoff') {
      handoffToNextTurn = true
      return runQuery(store, options)
    }

    if (outcome === 'completed') {
      state.setStreamingText(null)
    }
  } catch (error) {
    turnStatus = 'error'
    errorMessage = error instanceof Error ? error.message : String(error)
    console.error('Query Error:', error)
    try {
      turnStateMachine.transition({ type: 'fatal_error' })
    } catch (transitionError) {
      if (!(transitionError instanceof IllegalTurnTransitionError)) {
        throw transitionError
      }
    }
    state.setError(errorMessage)
  } finally {
    const durationMs = Date.now() - turnStart

    traceBus.emit({
      stage: 'query',
      event: 'execute_end',
      status: turnStatus,
      session_id: state.sessionId,
      trace_id: state.traceId,
      turn_id: turnId,
      span_id: createSpanId(),
      parent_span_id: turnSpanId,
      metrics: { duration_ms: durationMs },
      payload: turnStatus === 'error' ? { message: errorMessage } : undefined,
    })
    traceBus.emit({
      stage: 'turn',
      event: turnStatus === 'ok' ? 'end' : 'error',
      status: turnStatus,
      session_id: state.sessionId,
      trace_id: state.traceId,
      turn_id: turnId,
      span_id: turnSpanId,
      metrics: { duration_ms: durationMs },
      payload: turnStatus === 'error' ? { message: errorMessage } : undefined,
    })

    if (!handoffToNextTurn) {
      state.stopStreaming()
      state.setCurrentTurnId(null)
      state.setTurnState('idle', null)
    }
  }
}

function createProviderHooks(args: {
  traceBus: ReturnType<typeof getTraceBus>
  state: ReturnType<AppStore['getState']>
  turnId: string
  turnSpanId: string
  providerSpanId: string
}) {
  const { traceBus, state, turnId, turnSpanId, providerSpanId } = args

  return {
    onStart: () => {
      traceBus.emit({
        stage: 'provider',
        event: 'stream_start',
        status: 'start',
        session_id: state.sessionId,
        trace_id: state.traceId,
        turn_id: turnId,
        span_id: providerSpanId,
        parent_span_id: turnSpanId,
      })
    },
    onFirstEvent: () => {
      traceBus.emit({
        stage: 'provider',
        event: 'first_event',
        status: 'ok',
        session_id: state.sessionId,
        trace_id: state.traceId,
        turn_id: turnId,
        span_id: providerSpanId,
        parent_span_id: turnSpanId,
      })
    },
    onConnectTimeout: () => {
      traceBus.emit({
        stage: 'provider',
        event: 'connect_timeout',
        status: 'timeout',
        session_id: state.sessionId,
        trace_id: state.traceId,
        turn_id: turnId,
        span_id: providerSpanId,
        parent_span_id: turnSpanId,
      })
    },
    onIdleTimeout: () => {
      traceBus.emit({
        stage: 'provider',
        event: 'idle_timeout',
        status: 'timeout',
        session_id: state.sessionId,
        trace_id: state.traceId,
        turn_id: turnId,
        span_id: providerSpanId,
        parent_span_id: turnSpanId,
      })
    },
    onDone: () => {
      traceBus.emit({
        stage: 'provider',
        event: 'stream_end',
        status: 'ok',
        session_id: state.sessionId,
        trace_id: state.traceId,
        turn_id: turnId,
        span_id: providerSpanId,
        parent_span_id: turnSpanId,
      })
    },
    onError: (error: unknown) => {
      traceBus.emit({
        stage: 'provider',
        event: 'stream_error',
        status: 'error',
        session_id: state.sessionId,
        trace_id: state.traceId,
        turn_id: turnId,
        span_id: providerSpanId,
        parent_span_id: turnSpanId,
        payload: { error: error instanceof Error ? error.message : String(error) },
      })
    },
  }
}

function emitTurnStartTrace(args: {
  traceBus: ReturnType<typeof getTraceBus>
  state: ReturnType<AppStore['getState']>
  options?: QueryOptions
  turnId: string
  turnSpanId: string
}): void {
  const { traceBus, state, options, turnId, turnSpanId } = args

  traceBus.emit({
    stage: 'turn',
    event: 'start',
    status: 'start',
    session_id: state.sessionId,
    trace_id: state.traceId,
    turn_id: turnId,
    span_id: turnSpanId,
    payload: {
      message_count: state.messages.length,
      quiet: options?.quiet ?? state.quiet,
    },
  })
  traceBus.emit({
    stage: 'query',
    event: 'execute_start',
    status: 'start',
    session_id: state.sessionId,
    trace_id: state.traceId,
    turn_id: turnId,
    span_id: createSpanId(),
    parent_span_id: turnSpanId,
  })
}

function resolveContext(context: Context | null, cwd: string): Context {
  if (context) {
    return context
  }
  return {
    cwd,
    systemInfo: {
      platform: process.platform,
      nodeVersion: process.version,
      date: new Date().toISOString(),
    },
  }
}

function formatMessageForAPI(message: Message) {
  return {
    role: message.role,
    content: message.content,
  }
}
