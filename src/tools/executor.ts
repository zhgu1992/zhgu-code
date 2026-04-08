import type { AppStore } from '../state/store.js'
import { getTools } from './registry.js'
import type { ToolContext } from '../types.js'

export async function executeTool(
  name: string,
  input: unknown,
  store: AppStore,
): Promise<string> {
  const state = store.getState()
  const registry = getTools()
  const tool = registry.get(name)

  if (!tool) {
    return `Error: Unknown tool "${name}"`
  }

  const context: ToolContext = {
    cwd: state.cwd,
    permissionMode: state.permissionMode,
  }

  // Check permission
  if (state.permissionMode === 'ask') {
    const approved = await promptApproval(name, input, store)
    if (!approved) {
      return `Tool ${name} was denied by user`
    }
  }

  // Set progress
  store.getState().setToolProgress({
    name,
    status: 'running',
    startTime: Date.now(),
  })

  try {
    // 传递 store 给 tool，以便实时更新进度
    const result = await tool.execute(input, context, store)

    // 清除工具进度，让 Spinner 恢复显示 API 调用状态
    // 不显示 "完成" 状态，因为接下来还有 API 处理
    store.getState().setToolProgress(null)

    return String(result ?? '')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    store.getState().setToolProgress({
      name,
      status: 'error',
      message,
      startTime: Date.now(),
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
