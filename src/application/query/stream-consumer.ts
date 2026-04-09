import type { ContentBlock, StreamEvent } from '../../definitions/types/index.js'
import { appendTextDelta } from './formatting.js'

export interface StreamConsumerState {
  assistantContent: ContentBlock[]
  currentText: string
  currentThinking: string
  currentTool: { id: string; name: string; input: unknown } | null
}

export type StreamConsumerOutcome = 'completed' | 'handoff' | 'stopped'

export interface StreamConsumerHandlers {
  onThinkingChunk: (chunk: string, state: StreamConsumerState) => void
  onTextChunk: (chunk: string, state: StreamConsumerState) => StreamConsumerOutcome | void
  onToolUseStart: (
    event: Extract<StreamEvent, { type: 'tool_use_start' }>,
    state: StreamConsumerState,
  ) => void
  onToolInputComplete: (
    event: Extract<StreamEvent, { type: 'tool_input_complete' }>,
    state: StreamConsumerState,
  ) => Promise<StreamConsumerOutcome>
  onLegacyToolUse: (
    event: Extract<StreamEvent, { type: 'tool_use' }>,
    state: StreamConsumerState,
  ) => Promise<StreamConsumerOutcome>
  onDone: (
    event: Extract<StreamEvent, { type: 'done' }>,
    state: StreamConsumerState,
  ) => StreamConsumerOutcome | void
}

export async function consumeStreamEvents(
  streamIterator: AsyncGenerator<StreamEvent>,
  consumerState: StreamConsumerState,
  handlers: StreamConsumerHandlers,
): Promise<StreamConsumerOutcome> {
  for await (const event of streamIterator) {
    switch (event.type) {
      case 'thinking':
        handlers.onThinkingChunk(event.thinking, consumerState)
        break

      case 'text':
        {
          const outcome = handlers.onTextChunk(event.text, consumerState)
          if (outcome === 'handoff' || outcome === 'stopped') {
            return outcome
          }
        }
        break

      case 'tool_use_start':
        handlers.onToolUseStart(event, consumerState)
        break

      case 'tool_input_complete': {
        const outcome = await handlers.onToolInputComplete(event, consumerState)
        if (outcome !== 'completed') {
          return outcome
        }
        break
      }

      case 'tool_use': {
        const outcome = await handlers.onLegacyToolUse(event, consumerState)
        if (outcome !== 'completed') {
          return outcome
        }
        break
      }

      case 'done':
        {
          const outcome = handlers.onDone(event, consumerState)
          if (outcome === 'handoff' || outcome === 'stopped') {
            return outcome
          }
        }
        break

      case 'tool_start':
        // Legacy event; no-op in current pipeline.
        break
    }
  }

  return 'completed'
}

export function applyThinkingChunk(state: StreamConsumerState, chunk: string): void {
  state.currentThinking += chunk
}

export function applyTextChunk(state: StreamConsumerState, chunk: string): void {
  state.currentText += chunk
  appendTextDelta(state.assistantContent, chunk)
}
