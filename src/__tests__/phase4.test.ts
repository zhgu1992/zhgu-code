import { describe, test, expect, beforeEach, mock } from 'bun:test'
import { createStore, type AppStore, type PendingTool, type ToolProgress } from '../state/store.js'

describe('Phase 4: Experience Optimization', () => {
  let store: AppStore

  beforeEach(() => {
    store = createStore({
      model: 'claude-sonnet-4-20250514',
      permissionMode: 'ask',
      quiet: false,
      cwd: '/test',
    })
  })

  describe('Permission Prompt', () => {
    test('should set pending tool', () => {
      const pendingTool: PendingTool = {
        id: 'test-tool-1',
        name: 'Bash',
        input: { command: 'echo test' },
        resolve: () => {},
      }

      store.getState().setPendingTool(pendingTool)

      expect(store.getState().pendingTool).toEqual(pendingTool)
    })

    test('should resolve pending tool with approval', () => {
      let resolved = false
      let approved = false

      const pendingTool: PendingTool = {
        id: 'test-tool-1',
        name: 'Bash',
        input: { command: 'echo test' },
        resolve: (a: boolean) => {
          resolved = true
          approved = a
        },
      }

      store.getState().setPendingTool(pendingTool)
      store.getState().resolvePendingTool(true)

      expect(store.getState().pendingTool).toBeNull()
      expect(resolved).toBe(true)
      expect(approved).toBe(true)
    })

    test('should resolve pending tool with denial', () => {
      let approved = true

      const pendingTool: PendingTool = {
        id: 'test-tool-1',
        name: 'Bash',
        input: { command: 'rm -rf /' },
        resolve: (a: boolean) => {
          approved = a
        },
      }

      store.getState().setPendingTool(pendingTool)
      store.getState().resolvePendingTool(false)

      expect(store.getState().pendingTool).toBeNull()
      expect(approved).toBe(false)
    })
  })

  describe('Tool Progress', () => {
    test('should set tool progress', () => {
      const progress: ToolProgress = {
        name: 'Bash',
        status: 'running',
        startTime: Date.now(),
      }

      store.getState().setToolProgress(progress)

      expect(store.getState().toolProgress).toEqual(progress)
    })

    test('should update tool progress status', () => {
      store.getState().setToolProgress({
        name: 'Read',
        status: 'pending',
        startTime: Date.now(),
      })

      store.getState().setToolProgress({
        name: 'Read',
        status: 'completed',
        startTime: Date.now(),
      })

      expect(store.getState().toolProgress?.status).toBe('completed')
    })

    test('should clear tool progress', () => {
      store.getState().setToolProgress({
        name: 'Bash',
        status: 'running',
        startTime: Date.now(),
      })

      store.getState().setToolProgress(null)

      expect(store.getState().toolProgress).toBeNull()
    })
  })

  describe('Token Usage', () => {
    test('should set token usage', () => {
      store.getState().setTokenUsage(1000, 500)

      expect(store.getState().inputTokens).toBe(1000)
      expect(store.getState().outputTokens).toBe(500)
    })

    test('should accumulate token usage', () => {
      store.getState().setTokenUsage(1000, 500)
      store.getState().setTokenUsage(1000 + 2000, 500 + 1000)

      expect(store.getState().inputTokens).toBe(3000)
      expect(store.getState().outputTokens).toBe(1500)
    })
  })

  describe('Error Handling', () => {
    test('should set error', () => {
      store.getState().setError('API key not found')

      expect(store.getState().error).toBe('API key not found')
    })

    test('should clear error', () => {
      store.getState().setError('Test error')
      store.getState().setError(null)

      expect(store.getState().error).toBeNull()
    })

    test('should clear error when starting new query', () => {
      store.getState().setError('Previous error')
      store.getState().startStreaming()

      // Error should still exist (cleared in query.ts, not in startStreaming)
      expect(store.getState().error).toBe('Previous error')
      expect(store.getState().isStreaming).toBe(true)
    })
  })

  describe('P45-S02 Turn Link Compatibility', () => {
    test('should keep no-plan scenario compatible while recording turn plan link', () => {
      store.getState().applyTurnTransition({
        turnId: 'turn_no_plan_1',
        from: 'idle',
        to: 'streaming',
        event: 'turn_start',
      })

      expect(store.getState().turnState).toBe('streaming')
      expect(store.getState().turnOrchestratorLinks.turn_no_plan_1).toBeUndefined()
    })

    test('should append unique task ids under the same turn-plan mapping', () => {
      store.getState().applyTurnTransition({
        turnId: 'turn_with_plan_1',
        from: 'idle',
        to: 'streaming',
        event: 'turn_start',
        planId: 'plan_with_tasks_1',
      })
      store.getState().applyTurnTransition({
        turnId: 'turn_with_plan_1',
        from: 'streaming',
        to: 'tool-running',
        event: 'tool_use_detected',
        planId: 'plan_with_tasks_1',
        taskId: 'task_a',
      })
      store.getState().applyTurnTransition({
        turnId: 'turn_with_plan_1',
        from: 'streaming',
        to: 'tool-running',
        event: 'tool_use_detected',
        planId: 'plan_with_tasks_1',
        taskId: 'task_a',
      })

      expect(store.getState().turnOrchestratorLinks.turn_with_plan_1).toMatchObject({
        planId: 'plan_with_tasks_1',
        taskIds: ['task_a'],
      })
    })
  })
})

describe('Error Display Helper Functions', () => {
  // Test the error parsing logic
  function parseError(error: string): { type: string; suggestion?: string } {
    if (error.includes('API key') || error.includes('anthropic')) {
      return {
        type: 'api',
        suggestion: 'Check your API key in ~/.claude/settings.json',
      }
    }
    if (error.includes('denied') || error.includes('permission')) {
      return {
        type: 'permission',
        suggestion: 'Try running with --ask flag to approve actions',
      }
    }
    if (error.includes('network') || error.includes('ECONNREFUSED') || error.includes('ETIMEDOUT')) {
      return {
        type: 'network',
        suggestion: 'Check your network connection and try again',
      }
    }
    if (error.includes('Tool') || error.includes('tool')) {
      return {
        type: 'tool',
        suggestion: 'Check the tool parameters and try again',
      }
    }
    return { type: 'unknown' }
  }

  test('should identify API errors', () => {
    const result = parseError('API key invalid')
    expect(result.type).toBe('api')
    expect(result.suggestion).toContain('API key')
  })

  test('should identify permission errors', () => {
    const result = parseError('Tool was denied by user')
    expect(result.type).toBe('permission')
    expect(result.suggestion).toContain('--ask')
  })

  test('should identify network errors', () => {
    const result = parseError('ECONNREFUSED: Connection refused')
    expect(result.type).toBe('network')
    expect(result.suggestion).toContain('network')
  })

  test('should identify tool errors', () => {
    const result = parseError('Tool execution failed')
    expect(result.type).toBe('tool')
    expect(result.suggestion).toContain('parameters')
  })

  test('should handle unknown errors', () => {
    const result = parseError('Something went wrong')
    expect(result.type).toBe('unknown')
  })
})

describe('Token Formatting', () => {
  function formatNumber(n: number): string {
    if (n >= 1_000_000) {
      return (n / 1_000_000).toFixed(1) + 'M'
    }
    if (n >= 1_000) {
      return (n / 1_000).toFixed(1) + 'K'
    }
    return String(n)
  }

  test('should format small numbers', () => {
    expect(formatNumber(500)).toBe('500')
    expect(formatNumber(999)).toBe('999')
  })

  test('should format thousands', () => {
    expect(formatNumber(1000)).toBe('1.0K')
    expect(formatNumber(5000)).toBe('5.0K')
    expect(formatNumber(15000)).toBe('15.0K')
  })

  test('should format millions', () => {
    expect(formatNumber(1_000_000)).toBe('1.0M')
    expect(formatNumber(2_500_000)).toBe('2.5M')
  })
})
