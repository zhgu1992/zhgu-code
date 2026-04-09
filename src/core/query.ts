import type { AppStore } from '../state/store.js'
import { stream } from '../api/client.js'
import { getTools } from '../tools/registry.js'
import { buildSystemPrompt } from './prompt.js'
import { executeTool } from '../tools/executor.js'
import type { Message, ContentBlock } from '../definitions/types/index.js'
import type { Context } from './context.js'
import { createSpanId, createTurnId } from '../observability/ids.js'
import { getTraceBus } from '../observability/trace-bus.js'

interface QueryOptions {
  quiet?: boolean
  emitStdout?: boolean
}

export async function query(store: AppStore, options?: QueryOptions): Promise<void> {
  const state = store.getState()
  const traceBus = getTraceBus()
  const turnId = createTurnId()
  const turnSpanId = createSpanId()
  const providerSpanId = createSpanId()
  const turnStart = Date.now()
  let turnStatus: 'ok' | 'error' = 'ok'
  let errorMessage: string | undefined
  state.setCurrentTurnId(turnId)
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

  const tools = getTools()
  const quiet = options?.quiet ?? state.quiet
  const emitStdout = options?.emitStdout ?? true
  let handoffToNextTurn = false

  const messages = state.messages.map(formatMessageForAPI)

  // Build system prompt with default context if not set
  const context: Context = state.context ?? {
    cwd: state.cwd,
    systemInfo: {
      platform: process.platform,
      nodeVersion: process.version,
      date: new Date().toISOString(),
    },
  }
  const systemPrompt = buildSystemPrompt(context)

  // Clear streaming state at the start of each query to avoid accumulation
  state.setStreamingText('Connecting...')
  state.setThinking(null)
  state.startStreaming()
  state.setError(null) // Clear previous errors

  try {
    const streamIterator = stream({
      model: state.model,
      max_tokens: 4096,
      system: systemPrompt,
      messages,
      tools: tools.toAPISchema(),
    }, {
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
      onError: (error) => {
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
    })

    let assistantContent: ContentBlock[] = []
    let currentTool: { id: string; name: string; input: unknown } | null = null
    let currentText = ''
    let currentThinking = ''

    for await (const event of streamIterator) {
      switch (event.type) {
        case 'thinking':
          currentThinking += event.thinking
          state.setThinking(currentThinking)
          break

        case 'text':
          currentText += event.text
          appendTextDelta(assistantContent, event.text)
          // Update streaming text in state for UI to display
          state.setStreamingText(currentText)
          // Also output to stdout for pipe mode
          if (!quiet && emitStdout) {
            process.stdout.write(event.text)
          }
          break

        case 'tool_use_start':
          // Start tracking a new tool call
          currentTool = { id: event.id, name: event.name, input: {} }
          state.setStreamingText(`🔧 Tool: ${event.name}`)
          if (!quiet && emitStdout) {
            console.log(`\n🔧 Tool: ${event.name}`)
          }
          break

        case 'tool_input_complete':
          // Tool input is now complete, execute the tool
          if (currentTool && currentTool.id) {
            currentTool.input = event.input
            state.setStreamingText(`🔧 Executing: ${currentTool.name}...`)

            // Execute tool
            const result = await executeTool(currentTool.name, currentTool.input, store)

            // Add tool_use to content (for API history)
            assistantContent.push({
              type: 'tool_use',
              id: currentTool.id,
              name: currentTool.name,
              input: currentTool.input,
            })

            // Add assistant message with tool_use (internal, don't display)
            state.addMessage({
              role: 'assistant',
              content: assistantContent,
              isToolResult: true,
            })

            // Add tool result (internal, don't display)
            state.addMessage({
              role: 'user',
              content: [{
                type: 'tool_result',
                tool_use_id: currentTool.id,
                content: result,
              }],
              isToolResult: true,
            })

            // Set intermediate state before recursive call
            state.setStreamingText('🔄 Processing response...')
            // Don't clear thinking - keep showing intermediate progress
            // Recursively call query for multi-turn
            handoffToNextTurn = true
            return query(store, options)
          }
          break

        case 'tool_use':
          // Legacy: tool with complete input (non-streaming case)
          state.setStreamingText(`🔧 Executing: ${event.name}...`)
          if (!quiet && emitStdout) {
            console.log(`\n🔧 Tool: ${event.name}`)
          }
          const legacyResult = await executeTool(event.name, event.input, store)

          // Add tool_use to content
          assistantContent.push({
            type: 'tool_use',
            id: event.id,
            name: event.name,
            input: event.input,
          })

          // Add assistant message with tool_use (internal, don't display)
          state.addMessage({
            role: 'assistant',
            content: assistantContent,
            isToolResult: true,
          })

          // Add tool result (internal, don't display)
          state.addMessage({
            role: 'user',
            content: [{
              type: 'tool_result',
              tool_use_id: event.id,
              content: legacyResult,
            }],
            isToolResult: true,
          })

          // Set intermediate state before recursive call
          state.setStreamingText('🔄 Processing response...')
          // Don't clear thinking - keep showing intermediate progress
          // Recursively call query for multi-turn
          handoffToNextTurn = true
          return query(store, options)

        case 'done':
          // Message complete - update token usage
          if (event.inputTokens || event.outputTokens) {
            const currentState = store.getState()
            store.getState().setTokenUsage(
              currentState.inputTokens + (event.inputTokens || 0),
              currentState.outputTokens + (event.outputTokens || 0)
            )
          }

          // Add final assistant message (only if has text content)
          const hasTextContent = assistantContent.some(b => b.type === 'text')
          if (hasTextContent || currentThinking) {
            if (!quiet && emitStdout) {
              console.log('') // newline
            }
            const finalContent: ContentBlock[] = []
            if (currentThinking) {
              finalContent.push({ type: 'thinking', thinking: currentThinking })
            }
            finalContent.push(...assistantContent)
            state.addMessage({
              role: 'assistant',
              content: finalContent,
            })
          }
          break
      }
    }

    state.setStreamingText(null)
  } catch (error) {
    turnStatus = 'error'
    errorMessage = error instanceof Error ? error.message : String(error)
    console.error('Query Error:', error)
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
      metrics: {
        duration_ms: durationMs,
      },
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
      metrics: {
        duration_ms: durationMs,
      },
      payload: turnStatus === 'error' ? { message: errorMessage } : undefined,
    })

    if (!handoffToNextTurn) {
      state.stopStreaming()
      state.setCurrentTurnId(null)
    }
  }
}

function formatMessageForAPI(message: Message) {
  return {
    role: message.role,
    content: message.content,
  }
}

export function appendTextDelta(content: ContentBlock[], textDelta: string): void {
  if (!textDelta) {
    return
  }

  const lastBlock = content[content.length - 1]
  if (lastBlock?.type === 'text') {
    lastBlock.text += textDelta
    return
  }

  content.push({ type: 'text', text: textDelta })
}
