import { describe, test, expect, beforeEach } from 'bun:test'
import { create } from 'zustand'
import { getTools } from './src/tools/registry.js'
import { executeTool } from './src/tools/executor.js'
import type { AppState, AppActions, PendingTool, ToolProgress } from './src/state/store.js'
import type { PermissionMode } from './src/constants.js'

type StoreState = AppState & AppActions

// Mock store for testing
function createMockStore(overrides: Partial<AppState> = {}) {
  return create<StoreState>((set, get) => ({
    sessionId: 'test-session',
    messages: [],
    cwd: process.cwd(),
    model: 'claude-sonnet-4-6',
    permissionMode: 'auto' as PermissionMode,
    quiet: true,
    isStreaming: false,
    streamingText: null,
    thinking: null,
    error: null,
    context: null,
    pendingTool: null,
    toolProgress: null,
    inputTokens: 0,
    outputTokens: 0,

    addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
    setContext: (context) => set({ context }),
    clearMessages: () => set({ messages: [] }),
    startStreaming: () => set({ isStreaming: true, thinking: null }),
    stopStreaming: () => set({ isStreaming: false, thinking: null }),
    setStreamingText: (text) => set({ streamingText: text }),
    setThinking: (thinking) => set({ thinking }),
    appendThinking: (chunk) => set((s) => ({ thinking: (s.thinking || '') + chunk })),
    setError: (error) => set({ error }),
    setPendingTool: (tool) => set({ pendingTool: tool }),
    resolvePendingTool: (approved: boolean) => {
      const { pendingTool } = get()
      if (pendingTool) {
        pendingTool.resolve(approved)
        set({ pendingTool: null })
      }
    },
    setToolProgress: (progress) => set({ toolProgress: progress }),
    setTokenUsage: (input, output) => set({ inputTokens: input, outputTokens: output }),

    ...overrides,
  }))
}

describe('Phase 3 Tools', () => {
  describe('Tool Registry', () => {
    test('should have all P0 and P1 tools registered', () => {
      const registry = getTools()
      const tools = registry.getAll()

      // P0 tools
      expect(tools.find((t) => t.name === 'Bash')).toBeDefined()
      expect(tools.find((t) => t.name === 'Read')).toBeDefined()
      expect(tools.find((t) => t.name === 'Write')).toBeDefined()
      expect(tools.find((t) => t.name === 'Edit')).toBeDefined()
      expect(tools.find((t) => t.name === 'Glob')).toBeDefined()
      expect(tools.find((t) => t.name === 'Grep')).toBeDefined()

      // P1 tools
      expect(tools.find((t) => t.name === 'WebFetch')).toBeDefined()
      expect(tools.find((t) => t.name === 'WebSearch')).toBeDefined()
      expect(tools.find((t) => t.name === 'AskUserQuestion')).toBeDefined()

      expect(tools.length).toBe(9)
    })

    test('should generate correct API schema', () => {
      const registry = getTools()
      const schema = registry.toAPISchema()

      expect(schema.length).toBe(9)
      expect(schema[0]).toHaveProperty('name')
      expect(schema[0]).toHaveProperty('description')
      expect(schema[0]).toHaveProperty('input_schema')
    })
  })

  describe('Glob Tool', () => {
    test('should find TypeScript files', async () => {
      const store = createMockStore()
      const result = await executeTool('Glob', { pattern: '**/*.ts' }, store)

      expect(result).not.toContain('No files found')
      expect(result).toContain('.ts')
    })

    test('should respect path parameter', async () => {
      const store = createMockStore()
      const result = await executeTool(
        'Glob',
        { pattern: '*.ts', path: './src/tools' },
        store,
      )

      // Should find tool files
      expect(result).toContain('bash.ts')
      expect(result).toContain('read.ts')
    })

    test('should handle no matches', async () => {
      const store = createMockStore()
      const result = await executeTool(
        'Glob',
        { pattern: '**/*.nonexistent' },
        store,
      )

      expect(result).toContain('No files found')
    })
  })

  describe('Grep Tool', () => {
    test('should search for pattern in files', async () => {
      const store = createMockStore()
      const result = await executeTool(
        'Grep',
        { pattern: 'ToolRegistry', path: './src/tools' },
        store,
      )

      expect(result).not.toContain('No matches found')
      expect(result).toContain('registry')
    })

    test('should support glob filter', async () => {
      const store = createMockStore()
      const result = await executeTool(
        'Grep',
        { pattern: 'execute', path: './src/tools', glob: '*.ts' },
        store,
      )

      expect(result).not.toContain('No matches found')
    })

    test('should handle case insensitive search', async () => {
      const store = createMockStore()
      const result = await executeTool(
        'Grep',
        { pattern: 'TOOLREGISTRY', path: './src/tools', '-i': true },
        store,
      )

      expect(result).not.toContain('No matches found')
    })
  })

  describe('WebFetch Tool', () => {
    test('should validate URL', async () => {
      const store = createMockStore()
      const result = await executeTool(
        'WebFetch',
        { url: 'not-a-valid-url', prompt: 'test' },
        store,
      )

      expect(result).toContain('Error')
    })

    test('should reject non-http protocols', async () => {
      const store = createMockStore()
      const result = await executeTool(
        'WebFetch',
        { url: 'ftp://example.com', prompt: 'test' },
        store,
      )

      expect(result).toContain('Error')
    })

    // Note: This test makes a real network request
    test.skip('should fetch example.com', async () => {
      const store = createMockStore()
      const result = await executeTool(
        'WebFetch',
        { url: 'https://example.com', prompt: 'What is the title?' },
        store,
      )

      expect(result).not.toContain('Error')
      expect(result).toContain('example')
    })
  })

  describe('WebSearch Tool', () => {
    test('should validate query length', async () => {
      const store = createMockStore()
      const result = await executeTool('WebSearch', { query: 'a' }, store)

      expect(result).toContain('Error')
    })

    test('should reject both allowed and blocked domains', async () => {
      const store = createMockStore()
      const result = await executeTool(
        'WebSearch',
        {
          query: 'test',
          allowed_domains: ['example.com'],
          blocked_domains: ['bad.com'],
        },
        store,
      )

      expect(result).toContain('Error')
    })

    // Note: This test makes a real network request
    test.skip('should search for TypeScript', async () => {
      const store = createMockStore()
      const result = await executeTool(
        'WebSearch',
        { query: 'TypeScript programming language' },
        store,
      )

      expect(result).not.toContain('Error')
      expect(result).toContain('TypeScript')
    })
  })

  describe('AskUser Tool', () => {
    test('should validate questions array', async () => {
      const store = createMockStore()
      const result = await executeTool('AskUserQuestion', { questions: [] }, store)

      expect(result).toContain('Error')
    })

    test('should limit to 4 questions', async () => {
      const store = createMockStore()
      const questions = Array(5)
        .fill(null)
        .map((_, i) => ({
          question: `Question ${i}?`,
          header: `Q${i}`,
          options: [
            { label: 'A', description: 'Option A' },
            { label: 'B', description: 'Option B' },
          ],
        }))

      const result = await executeTool('AskUserQuestion', { questions }, store)

      expect(result).toContain('Error')
      expect(result).toContain('Maximum 4 questions')
    })

    test('should validate options count', async () => {
      const store = createMockStore()
      const result = await executeTool('AskUserQuestion', {
        questions: [
          {
            question: 'Test?',
            header: 'Test',
            options: [{ label: 'Only one', description: 'Single option' }],
          },
        ],
      }, store)

      expect(result).toContain('Error')
    })
  })

  describe('Tool Input Schema Validation', () => {
    test('WebFetch should have correct schema', () => {
      const registry = getTools()
      const tool = registry.get('WebFetch')
      const schema = tool!.inputSchema

      expect(schema.type).toBe('object')
      expect(schema.properties.url).toBeDefined()
      expect(schema.properties.prompt).toBeDefined()
      expect(schema.required).toContain('url')
      expect(schema.required).toContain('prompt')
    })

    test('WebSearch should have correct schema', () => {
      const registry = getTools()
      const tool = registry.get('WebSearch')
      const schema = tool!.inputSchema

      expect(schema.type).toBe('object')
      expect(schema.properties.query).toBeDefined()
      expect(schema.properties.allowed_domains).toBeDefined()
      expect(schema.properties.blocked_domains).toBeDefined()
      expect(schema.required).toContain('query')
    })

    test('AskUser should have correct schema', () => {
      const registry = getTools()
      const tool = registry.get('AskUserQuestion')
      const schema = tool!.inputSchema

      expect(schema.type).toBe('object')
      expect(schema.properties.questions).toBeDefined()
      expect(schema.required).toContain('questions')
    })
  })
})
