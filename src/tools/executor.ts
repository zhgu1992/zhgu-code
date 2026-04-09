import type { AppStore } from '../state/store.js'
import { getTools } from './registry.js'
import type { ToolContext } from '../types.js'
import { createSpanId } from '../observability/ids.js'
import { getTraceBus } from '../observability/trace-bus.js'

export async function executeTool(
  name: string,
  input: unknown,
  store: AppStore,
): Promise<string> {
  const state = store.getState()
  const traceBus = getTraceBus()
  const toolSpanId = createSpanId()
  const toolStart = Date.now()
  const registry = getTools()
  const tool = registry.get(name)

  if (!tool) {
    traceBus.emit({
      stage: 'tool',
      event: 'call_error',
      status: 'error',
      session_id: state.sessionId,
      trace_id: state.traceId,
      turn_id: state.currentTurnId ?? undefined,
      span_id: toolSpanId,
      payload: { toolName: name, error: `Unknown tool: ${name}` },
    })
    return `Error: Unknown tool "${name}"`
  }

  const context: ToolContext = {
    cwd: state.cwd,
    permissionMode: state.permissionMode,
  }

  // Check permission
  if (state.permissionMode === 'ask') {
    traceBus.emit({
      stage: 'permission',
      event: 'prompt_request',
      status: 'start',
      session_id: state.sessionId,
      trace_id: state.traceId,
      turn_id: state.currentTurnId ?? undefined,
      span_id: createSpanId(),
      payload: { toolName: name },
    })
    const approved = await promptApproval(name, input, store)
    if (!approved) {
      traceBus.emit({
        stage: 'tool',
        event: 'call_error',
        status: 'error',
        session_id: state.sessionId,
        trace_id: state.traceId,
        turn_id: state.currentTurnId ?? undefined,
        span_id: toolSpanId,
        metrics: { duration_ms: Date.now() - toolStart },
        payload: { toolName: name, error: 'Denied by user' },
      })
      return `Tool ${name} was denied by user`
    }
  } else {
    traceBus.emit({
      stage: 'permission',
      event: 'auto_allow',
      status: 'ok',
      session_id: state.sessionId,
      trace_id: state.traceId,
      turn_id: state.currentTurnId ?? undefined,
      span_id: createSpanId(),
      payload: { toolName: name, mode: state.permissionMode },
      priority: 'low',
    })
  }

  // Set progress
  store.getState().setToolProgress({
    name,
    status: 'running',
    startTime: Date.now(),
  })
  traceBus.emit({
    stage: 'tool',
    event: 'call_start',
    status: 'start',
    session_id: state.sessionId,
    trace_id: state.traceId,
    turn_id: state.currentTurnId ?? undefined,
    span_id: toolSpanId,
    payload: { toolName: name, input },
  })

  try {
    // 传递 store 给 tool，以便实时更新进度
    const result = await tool.execute(input, context, store)

    // 清除工具进度，让 Spinner 恢复显示 API 调用状态
    // 不显示 "完成" 状态，因为接下来还有 API 处理
    store.getState().setToolProgress(null)
    traceBus.emit({
      stage: 'tool',
      event: 'call_end',
      status: 'ok',
      session_id: state.sessionId,
      trace_id: state.traceId,
      turn_id: state.currentTurnId ?? undefined,
      span_id: toolSpanId,
      metrics: { duration_ms: Date.now() - toolStart },
      payload: {
        toolName: name,
        result_bytes: String(result ?? '').length,
      },
    })

    return String(result ?? '')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    store.getState().setToolProgress({
      name,
      status: 'error',
      message,
      startTime: Date.now(),
    })
    traceBus.emit({
      stage: 'tool',
      event: 'call_error',
      status: 'error',
      session_id: state.sessionId,
      trace_id: state.traceId,
      turn_id: state.currentTurnId ?? undefined,
      span_id: toolSpanId,
      metrics: { duration_ms: Date.now() - toolStart },
      payload: { toolName: name, error: message },
    })

    return `Error: ${message}`
  }
}

async function promptApproval(
  toolName: string,
  input: unknown,
  store: AppStore,
): Promise<boolean> {
  return new Promise((resolve) => {
    store.getState().setPendingTool({
      id: `${toolName}-${Date.now()}`,
      name: toolName,
      input,
      resolve,
    })
  })
}
