import Anthropic from '@anthropic-ai/sdk'
import type { StreamEvent, MessageParams } from '../definitions/types/index.js'
import { getAPIConfig } from '../services/config.js'

let client: Anthropic | null = null

const STREAM_CONNECT_TIMEOUT_MS = Number.parseInt(
  process.env.ZHGU_STREAM_CONNECT_TIMEOUT_MS || '20000',
  10,
)
const STREAM_IDLE_TIMEOUT_MS = Number.parseInt(
  process.env.ZHGU_STREAM_IDLE_TIMEOUT_MS || '45000',
  10,
)
const STREAM_REQUEST_TIMEOUT_MS = Number.parseInt(
  process.env.ZHGU_STREAM_REQUEST_TIMEOUT_MS || '600000',
  10,
)

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: 'connection' | 'idle',
  onTimeout?: () => void,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          onTimeout?.()
          reject(new Error(`Stream ${label} timeout after ${timeoutMs}ms`))
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

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

export interface StreamLifecycleHooks {
  onStart?: () => void
  onFirstEvent?: () => void
  onConnectTimeout?: () => void
  onIdleTimeout?: () => void
  onDone?: () => void
  onError?: (error: unknown) => void
}

/**
 * Stream API using streaming for real-time thinking and text
 * Handles tool input streaming via input_json_delta events
 */
export async function* stream(
  params: MessageParams,
  hooks?: StreamLifecycleHooks,
): AsyncGenerator<StreamEvent> {
  const api = createClient()

  // Build request params
  const requestParams: Anthropic.Messages.MessageStreamParams = {
    model: params.model,
    max_tokens: params.max_tokens,
    messages: params.messages as Anthropic.Messages.MessageParam[],
  }

  if (params.system) {
    requestParams.system = params.system as Anthropic.Messages.MessageStreamParams['system']
  }

  if (params.tools && params.tools.length > 0) {
    requestParams.tools = params.tools as Anthropic.Messages.Tool[]
  }

  try {
    hooks?.onStart?.()

    // Use streaming API
    const messageStream = api.messages.stream(requestParams, {
      timeout: STREAM_REQUEST_TIMEOUT_MS,
    })

    // Track tool input accumulation for each tool use
    const toolInputs: Map<number, string> = new Map()
    let doneEmitted = false
    let hasReceivedEvent = false
    let firstEventEmitted = false

    const iterator = messageStream[Symbol.asyncIterator]()

    while (true) {
      const timeoutMs = hasReceivedEvent
        ? STREAM_IDLE_TIMEOUT_MS
        : STREAM_CONNECT_TIMEOUT_MS
      const next = await withTimeout(
        iterator.next(),
        timeoutMs,
        hasReceivedEvent ? 'idle' : 'connection',
        () => {
          messageStream.abort()
          if (hasReceivedEvent) {
            hooks?.onIdleTimeout?.()
          } else {
            hooks?.onConnectTimeout?.()
          }
        },
      )

      if (next.done) break

      hasReceivedEvent = true
      if (!firstEventEmitted) {
        firstEventEmitted = true
        hooks?.onFirstEvent?.()
      }
      const event = next.value

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
          doneEmitted = true
          hooks?.onDone?.()
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

    // Some non-standard providers may close stream without message_stop.
    if (!doneEmitted) {
      hooks?.onDone?.()
      yield {
        type: 'done',
        inputTokens: undefined,
        outputTokens: undefined,
      }
    }
  } catch (error) {
    hooks?.onError?.(error)
    console.error('API Error:', error)
    throw error
  }
}
