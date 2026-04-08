import type { AppStore } from '../state/store.js'
import { stream } from '../api/client.js'
import { getTools } from '../tools/registry.js'
import { buildSystemPrompt } from './prompt.js'
import { executeTool } from '../tools/executor.js'
import type { Message, ContentBlock } from '../types.js'
import type { Context } from './context.js'

export async function query(store: AppStore, options?: { quiet?: boolean }): Promise<void> {
  const state = store.getState()
  const tools = getTools()
  const quiet = options?.quiet ?? state.quiet

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

  state.startStreaming()
  state.setError(null) // Clear previous errors

  try {
    const streamIterator = stream({
      model: state.model,
      max_tokens: 4096,
      system: systemPrompt,
      messages,
      tools: tools.toAPISchema(),
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
          assistantContent.push({ type: 'text', text: event.text })
          // Update streaming text in state for UI to display
          state.setStreamingText(currentText)
          // Also output to stdout for pipe mode
          if (!quiet) {
            process.stdout.write(event.text)
          }
          break

        case 'tool_use_start':
          // Start tracking a new tool call
          currentTool = { id: event.id, name: event.name, input: {} }
          state.setStreamingText(`🔧 Tool: ${event.name}`)
          if (!quiet) {
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

            state.setStreamingText(null)
            // Recursively call query for multi-turn
            return query(store, options)
          }
          break

        case 'tool_use':
          // Legacy: tool with complete input (non-streaming case)
          state.setStreamingText(`🔧 Executing: ${event.name}...`)
          if (!quiet) {
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

          state.setStreamingText(null)
          // Recursively call query for multi-turn
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
            if (!quiet) {
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
    console.error('Query Error:', error)
    state.setError(error instanceof Error ? error.message : String(error))
  } finally {
    state.stopStreaming()
  }
}

function formatMessageForAPI(message: Message) {
  return {
    role: message.role,
    content: message.content,
  }
}
