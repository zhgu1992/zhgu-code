import { create, type UseBoundStore, type StoreApi } from 'zustand'
import type { Message } from '../types.js'
import type { Context } from '../core/context.js'
import type { PermissionMode } from '../constants.js'

// Permission prompt types
export interface PendingTool {
  id: string
  name: string
  input: unknown
  resolve: (approved: boolean) => void
}

export interface ToolProgress {
  name: string
  status: 'pending' | 'running' | 'completed' | 'error'
  message?: string
  startTime: number
  // Bash 扩展信息
  output?: string
  totalLines?: number
  totalBytes?: number
  elapsedTimeSeconds?: number
}

export interface AppState {
  // Config
  model: string
  permissionMode: PermissionMode
  quiet: boolean
  cwd: string
  context: Context | null

  // Messages
  messages: Message[]

  // Streaming
  isStreaming: boolean
  streamingText: string | null
  thinking: string | null

  // Error
  error: string | null

  // Permission prompt
  pendingTool: PendingTool | null

  // Tool progress
  toolProgress: ToolProgress | null

  // Token usage
  inputTokens: number
  outputTokens: number
}

export interface AppActions {
  // Context
  setContext: (context: Context) => void

  // Messages
  addMessage: (message: Message) => void
  clearMessages: () => void

  // Streaming
  startStreaming: () => void
  stopStreaming: () => void
  setStreamingText: (text: string | null) => void
  setThinking: (thinking: string | null) => void
  appendThinking: (thinking: string) => void

  // Error
  setError: (error: string | null) => void

  // Permission prompt
  setPendingTool: (tool: PendingTool | null) => void
  resolvePendingTool: (approved: boolean) => void

  // Tool progress
  setToolProgress: (progress: ToolProgress | null) => void
  updateToolProgress: (updates: Partial<ToolProgress>) => void

  // Token usage
  setTokenUsage: (input: number, output: number) => void
}

type StoreState = AppState & AppActions

export type AppStore = UseBoundStore<StoreApi<StoreState>>

interface CreateStoreOptions {
  model: string
  permissionMode: PermissionMode
  quiet: boolean
  cwd: string
}

export function createStore(options: CreateStoreOptions): AppStore {
  let messageSeq = 1

  return create<StoreState>((set, get) => ({
    // Initial state
    model: options.model,
    permissionMode: options.permissionMode,
    quiet: options.quiet,
    cwd: options.cwd,
    context: null,
    messages: [],
    isStreaming: false,
    streamingText: null,
    thinking: null,
    error: null,
    pendingTool: null,
    toolProgress: null,
    inputTokens: 0,
    outputTokens: 0,

    // Actions
    setContext: (context: Context) => set({ context }),

    addMessage: (message: Message) => set((state) => {
      if (message.id) {
        return { messages: [...state.messages, message] }
      }

      return {
        messages: [...state.messages, { ...message, id: `m_${messageSeq++}` }],
      }
    }),

    clearMessages: () => set({ messages: [] }),

    startStreaming: () => set({ isStreaming: true }),

    stopStreaming: () => set({ isStreaming: false, thinking: null }),

    setStreamingText: (streamingText: string | null) => set({ streamingText }),

    setThinking: (thinking: string | null) => set({ thinking }),

    appendThinking: (chunk: string) => set((state) => ({
      thinking: (state.thinking || '') + chunk,
    })),

    setError: (error: string | null) => set({ error }),

    // Permission prompt
    setPendingTool: (tool) => set({ pendingTool: tool }),

    resolvePendingTool: (approved: boolean) => {
      const { pendingTool } = get()
      if (pendingTool) {
        pendingTool.resolve(approved)
        set({ pendingTool: null })
      }
    },

    // Tool progress
    setToolProgress: (progress) => set({ toolProgress: progress }),

    // Tool progress update (partial update for streaming)
    updateToolProgress: (updates: Partial<ToolProgress>) => set((state) => ({
      toolProgress: state.toolProgress
        ? { ...state.toolProgress, ...updates }
        : null,
    })),

    // Token usage
    setTokenUsage: (input, output) => set({ inputTokens: input, outputTokens: output }),
  }))
}
