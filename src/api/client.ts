import Anthropic from '@anthropic-ai/sdk'
import type { StreamEvent, MessageParams } from '../types.js'
import { getAPIConfig } from '../services/config.js'

let client: Anthropic | null = null

export function createClient(): Anthropic {
  if (client) return client

  const config = getAPIConfig()

  const apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('Error: API key not found')
    console.error('Set it in ~/.claude/settings.json or as environment variable')
    process.exit(1)
  }

  client = new Anthropic({
    apiKey,
    baseURL: config.baseURL,
    defaultHeaders: {
      'x-app': 'zhgu-code',
      ...(config.customHeaders || {}),
    },
  })

  return client
}

/**
 * Stream API using streaming for real-time thinking and text
 * Handles tool input streaming via input_json_delta events
 */
export async function* stream(params: MessageParams): AsyncGenerator<StreamEvent> {
  const api = createClient()

  // Build request params
  const requestParams: Anthropic.Messages.MessageStreamParams = {
    model: params.model,
    max_tokens: params.max_tokens,
    messages: params.messages as Anthropic.Messages.MessageParam[],
  }

  if (params.system) {
    requestParams.system = params.system
  }

  if (params.tools && params.tools.length > 0) {
    requestParams.tools = params.tools as Anthropic.Messages.Tool[]
  }

  try {
    // Use streaming API
    const messageStream = await api.messages.stream(requestParams)

    // Track tool input accumulation for each tool use
    const toolInputs: Map<number, string> = new Map()

    for await (const event of messageStream) {
      switch (event.type) {
        case 'content_block_delta':
          if (event.delta.type === 'text_delta') {
            yield { type: 'text', text: event.delta.text }
          } else if (event.delta.type === 'thinking_delta') {
            yield { type: 'thinking', thinking: event.delta.thinking }
          } else if (event.delta.type === 'input_json_delta') {
            // Accumulate tool input JSON
            const index = event.index
            const partialJson = event.delta.partial_json || ''
            const current = toolInputs.get(index) || ''
            toolInputs.set(index, current + partialJson)
          }
          break

        case 'content_block_start':
          if (event.content_block.type === 'tool_use') {
            // Initialize tool input tracking
            toolInputs.set(event.index, '')
            yield {
              type: 'tool_use_start',
              id: event.content_block.id,
              name: event.content_block.name,
              index: event.index,
            }
          } else if (event.content_block.type === 'thinking') {
            // Thinking block started
          }
          break

        case 'content_block_stop':
          if (event.index !== undefined) {
            const inputJson = toolInputs.get(event.index)
            if (inputJson) {
              yield {
                type: 'tool_input_complete',
                index: event.index,
                input: JSON.parse(inputJson),
              }
              toolInputs.delete(event.index)
            }
          }
          break

        case 'message_stop':
          // Signal completion - don't wait for finalMessage() to avoid blocking
          yield {
            type: 'done',
            inputTokens: undefined,
            outputTokens: undefined,
          }
          break

        case 'message_start':
          // Get token usage from message_start event
          if (event.message?.usage) {
            // We'll update token usage when available
          }
          break
      }
    }
  } catch (error) {
    console.error('API Error:', error)
    throw error
  }
}
