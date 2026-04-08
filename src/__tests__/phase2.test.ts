import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { createStore, type AppStore } from '../state/store.js'
import { getTools } from '../tools/registry.js'

// Mock store factory
function createTestStore(): AppStore {
  return createStore({
    model: 'claude-sonnet-4-20250514',
    permissionMode: 'auto',
    quiet: true,
    cwd: '/test',
  })
}

describe('阶段2: 核心循环验证', () => {
  describe('2.1 状态管理 (Store)', () => {
    let store: AppStore

    beforeEach(() => {
      store = createTestStore()
    })

    test('应能创建 store 并初始化默认值', () => {
      const state = store.getState()
      expect(state.model).toBe('claude-sonnet-4-20250514')
      expect(state.permissionMode).toBe('auto')
      expect(state.quiet).toBe(true)
      expect(state.messages).toEqual([])
      expect(state.isStreaming).toBe(false)
      expect(state.thinking).toBeNull()
    })

    test('应能添加消息', () => {
      store.getState().addMessage({
        role: 'user',
        content: 'Hello',
      })
      const state = store.getState()
      expect(state.messages.length).toBe(1)
      expect(state.messages[0].role).toBe('user')
      expect(state.messages[0].content).toBe('Hello')
    })

    test('应能处理流式状态', () => {
      store.getState().startStreaming()
      expect(store.getState().isStreaming).toBe(true)

      store.getState().setThinking('Thinking...')
      expect(store.getState().thinking).toBe('Thinking...')

      store.getState().stopStreaming()
      expect(store.getState().isStreaming).toBe(false)
      expect(store.getState().thinking).toBeNull() // stopStreaming should clear thinking
    })

    test('应能追加思考内容', () => {
      store.getState().setThinking('First ')
      store.getState().appendThinking('Second')
      expect(store.getState().thinking).toBe('First Second')
    })
  })

  describe('2.2 工具注册表', () => {
    test('应能获取所有已注册工具', () => {
      const tools = getTools()
      const allTools = tools.getAll()

      expect(allTools.length).toBeGreaterThanOrEqual(6)

      const toolNames = allTools.map((t) => t.name)
      expect(toolNames).toContain('Bash')
      expect(toolNames).toContain('Read')
      expect(toolNames).toContain('Write')
      expect(toolNames).toContain('Edit')
      expect(toolNames).toContain('Glob')
      expect(toolNames).toContain('Grep')
    })

    test('应能通过名称获取工具', () => {
      const tools = getTools()
      const bashTool = tools.get('Bash')

      expect(bashTool).toBeDefined()
      expect(bashTool?.name).toBe('Bash')
      expect(bashTool?.description).toBeDefined()
      expect(bashTool?.inputSchema).toBeDefined()
    })

    test('应能生成 API schema', () => {
      const tools = getTools()
      const schema = tools.toAPISchema()

      expect(schema.length).toBeGreaterThanOrEqual(6)
      expect(schema[0]).toHaveProperty('name')
      expect(schema[0]).toHaveProperty('description')
      expect(schema[0]).toHaveProperty('input_schema')
    })

    test('获取不存在的工具应返回 undefined', () => {
      const tools = getTools()
      expect(tools.get('NonExistent')).toBeUndefined()
    })
  })

  describe('2.3 Bash 工具', () => {
    let store: AppStore

    beforeEach(() => {
      store = createTestStore()
    })

    test('应能执行简单命令 (echo)', async () => {
      const tools = getTools()
      const bashTool = tools.get('Bash')!

      const result = await bashTool.execute(
        { command: 'echo "hello world"' },
        { cwd: '/test', permissionMode: 'auto' }
      )

      expect(result).toContain('hello world')
    })

    test('应能返回错误信息 (无效命令)', async () => {
      const tools = getTools()
      const bashTool = tools.get('Bash')!

      const result = await bashTool.execute(
        { command: 'exit 1' },
        { cwd: '/test', permissionMode: 'auto' }
      )

      expect(result).toContain('Error')
    })
  })

  describe('2.4 Read 工具', () => {
    let store: AppStore

    beforeEach(() => {
      store = createTestStore()
    })

    test('应能读取文件', async () => {
      const tools = getTools()
      const readTool = tools.get('Read')!

      const result = await readTool.execute(
        { file_path: '/Users/zhgu/Documents/claude-code-run/rewrite/package.json' },
        { cwd: '/test', permissionMode: 'auto' }
      )

      expect(result).toContain('name')
      expect(result).toContain('zhgu-code')
    })

    test('应能处理不存在的文件', async () => {
      const tools = getTools()
      const readTool = tools.get('Read')!

      const result = await readTool.execute(
        { file_path: '/nonexistent/file.txt' },
        { cwd: '/test', permissionMode: 'auto' }
      )

      expect(result).toContain('Error')
    })
  })

  describe('2.5 Write 工具', () => {
    let store: AppStore
    const testFilePath = '/tmp/zhgu-code-test-write.txt'

    beforeEach(() => {
      store = createTestStore()
    })

    afterEach(async () => {
      // Cleanup - ignore errors if file doesn't exist
      try {
        const file = Bun.file(testFilePath)
        if (await file.exists()) file.delete()
      } catch {}
    })

    test('应能创建新文件', async () => {
      const tools = getTools()
      const writeTool = tools.get('Write')!

      const result = await writeTool.execute(
        { file_path: testFilePath, content: 'Hello World' },
        { cwd: '/test', permissionMode: 'auto' }
      )

      expect(result).toContain('Successfully wrote')
      expect(result).toContain(testFilePath)

      // Verify file was created
      const content = await Bun.file(testFilePath).text()
      expect(content).toBe('Hello World')
    })
  })

  describe('2.6 Edit 工具', () => {
    const testFilePath = '/tmp/zhgu-code-test-edit.txt'

    beforeEach(async () => {
      // Create test file
      await Bun.write(testFilePath, 'Hello World\nTest Line 2\nEnd')
    })

    afterEach(async () => {
      // Cleanup - ignore errors if file doesn't exist
      try {
        const file = Bun.file(testFilePath)
        if (await file.exists()) file.delete()
      } catch {}
    })

    test('应能编辑文件内容', async () => {
      const tools = getTools()
      const editTool = tools.get('Edit')!

      const result = await editTool.execute(
        {
          file_path: testFilePath,
          old_string: 'Hello World',
          new_string: 'Hello Universe',
        },
        { cwd: '/test', permissionMode: 'auto' }
      )

      expect(result).toContain('Successfully edited')

      const content = await Bun.file(testFilePath).text()
      expect(content).toContain('Hello Universe')
      expect(content).not.toContain('Hello World')
    })

    test('应能处理不存在的文件', async () => {
      const tools = getTools()
      const editTool = tools.get('Edit')!

      const result = await editTool.execute(
        {
          file_path: '/nonexistent/file.txt',
          old_string: 'old',
          new_string: 'new',
        },
        { cwd: '/test', permissionMode: 'auto' }
      )

      expect(result).toContain('Error')
      expect(result).toContain('not found')
    })
  })

  describe('2.7 Glob 工具', () => {
    test('应能匹配文件', async () => {
      const tools = getTools()
      const globTool = tools.get('Glob')!

      const result = await globTool.execute(
        { pattern: '*.ts', path: '/Users/zhgu/Documents/claude-code-run/rewrite/src' },
        { cwd: '/test', permissionMode: 'auto' }
      )

      expect(result).toContain('entrypoint.ts')
    })
  })

  describe('2.8 Grep 工具', () => {
    test('应能搜索内容', async () => {
      const tools = getTools()
      const grepTool = tools.get('Grep')!

      const result = await grepTool.execute(
        {
          pattern: 'zhgu-code',
          path: '/Users/zhgu/Documents/claude-code-run/rewrite/src',
          output_mode: 'content',
        },
        { cwd: '/test', permissionMode: 'auto' }
      )

      expect(result).toContain('zhgu-code')
    })
  })

  describe('2.9 消息格式', () => {
    test('消息内容应支持多种格式', () => {
      const store = createTestStore()

      // 字符串内容
      store.getState().addMessage({
        role: 'user',
        content: 'Simple string message',
      })
      expect(store.getState().messages[0].content).toBe('Simple string message')

      // 数组内容（内容块）
      store.getState().addMessage({
        role: 'assistant',
        content: [
          { type: 'text', text: 'Hello' },
          { type: 'thinking', thinking: 'Thinking...' },
        ],
      })
      const msg = store.getState().messages[1]
      expect(Array.isArray(msg.content)).toBe(true)
      expect((msg.content as any[])[0].type).toBe('text')
    })
  })
})