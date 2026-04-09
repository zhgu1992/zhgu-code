import type { ContentBlock } from '../../definitions/types/index.js'
import type { AppStore } from '../../state/store.js'
import { executeTool } from '../../tools/executor.js'
import type { TurnStateMachine } from './turn-state.js'

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
}

export async function executeToolAndPersist(
  args: ExecuteToolAndPersistArgs,
): Promise<ToolOrchestrationResult> {
  const { store, call, assistantContent, turnStateMachine } = args
  const state = store.getState()

  state.setStreamingText(`🔧 Executing: ${call.name}...`)
  const result = await executeTool(call.name, call.input, store)
  const deniedByUser = isToolDeniedByUser(result, call.name)

  if (state.permissionMode === 'ask') {
    turnStateMachine.transition({
      type: deniedByUser ? 'permission_denied' : 'permission_approved',
    })
  }

  if (deniedByUser) {
    state.setError(result)
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

function isToolDeniedByUser(result: string, toolName: string): boolean {
  return result.startsWith(`Tool ${toolName} was denied by user`)
}
