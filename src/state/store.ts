import { resolve } from 'node:path'
import { create, type UseBoundStore, type StoreApi } from 'zustand'
import type { Message } from '../definitions/types/index.js'
import type { Context } from '../core/context.js'
import type { PermissionMode } from '../definitions/types/permission.js'
import type { ContextHealthSnapshot } from '../application/query/context-health.js'
import { createSessionId, createSpanId, createTraceId } from '../observability/ids.js'
import { getTraceBus } from '../observability/trace-bus.js'
import { JsonlTranscriptWriter } from '../application/query/transcript/writer.js'
import {
  createRuntimeSessionSnapshot,
  patchActivePlanContext,
  upsertActivePlanTask,
  writeActivePlanContext,
  type RuntimeSessionSnapshot,
  type WriteActivePlanContextInput,
  type PatchActivePlanContextInput,
  type UpsertActivePlanTaskInput,
} from '../application/orchestrator/runtime-session.js'
import type {
  QueryTurnState,
  QueryTurnStopReason,
  QueryTurnTransition,
} from '../architecture/contracts/query-engine.js'

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
  sessionId: string
  traceId: string
  model: string
  permissionMode: PermissionMode
  quiet: boolean
  cwd: string
  context: Context | null
  currentTurnId: string | null
  turnState: QueryTurnState
  turnStopReason: QueryTurnStopReason | null
  lastContextHealthSnapshot: ContextHealthSnapshot | null
  lastContextHealthUpdatedAt: string | null
  orchestratorRuntimeSession: RuntimeSessionSnapshot

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
  setCurrentTurnId: (turnId: string | null) => void
  setTurnState: (state: QueryTurnState, reason?: QueryTurnStopReason | null) => void
  applyTurnTransition: (transition: QueryTurnTransition) => void
  setContextHealthSnapshot: (snapshot: ContextHealthSnapshot, updatedAt?: string) => void
  setActivePlanContext: (input: WriteActivePlanContextInput | null) => void
  patchActivePlanContext: (input: PatchActivePlanContextInput) => void
  upsertActivePlanTask: (input: UpsertActivePlanTaskInput) => void

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
  setPermissionMode: (
    permissionMode: PermissionMode,
    meta?: { source?: string; command?: string },
  ) => void

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
  const sessionId = createSessionId()
  const traceId = createTraceId()
  const traceBus = getTraceBus()
  const transcriptFilePath = resolve(
    process.cwd(),
    process.env.ZHGU_TRANSCRIPT_FILE || '.trace/transcript.jsonl',
  )
  const transcriptWriter = new JsonlTranscriptWriter({
    outputPath: transcriptFilePath,
    onError: (error, context) => {
      const message = error instanceof Error ? error.message : String(error)
      traceBus.emit({
        stage: 'state',
        event: 'transcript_write_error',
        status: 'error',
        session_id: sessionId,
        trace_id: traceId,
        span_id: createSpanId(),
        priority: 'high',
        payload: {
          file: context.outputPath,
          event_type: context.event.type,
          message,
        },
      })
      process.stderr.write(
        `[transcript] write failed path=${context.outputPath} type=${context.event.type} error=${message}\n`,
      )
    },
  })

  transcriptWriter.recordSessionStart({
    sessionId,
    traceId,
    model: options.model,
    cwd: options.cwd,
  })

  return create<StoreState>((set, get) => ({
    // Initial state
    sessionId,
    traceId,
    model: options.model,
    permissionMode: options.permissionMode,
    quiet: options.quiet,
    cwd: options.cwd,
    context: null,
    currentTurnId: null,
    turnState: 'idle',
    turnStopReason: null,
    lastContextHealthSnapshot: null,
    lastContextHealthUpdatedAt: null,
    orchestratorRuntimeSession: createRuntimeSessionSnapshot({ sessionId }),
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

    setCurrentTurnId: (turnId: string | null) => set({ currentTurnId: turnId }),

    setTurnState: (turnState, reason = null) => set({ turnState, turnStopReason: reason }),

    setContextHealthSnapshot: (snapshot, updatedAt = new Date().toISOString()) =>
      set({
        lastContextHealthSnapshot: snapshot,
        lastContextHealthUpdatedAt: updatedAt,
      }),

    setActivePlanContext: (input) =>
      set((state) => ({
        orchestratorRuntimeSession: writeActivePlanContext(state.orchestratorRuntimeSession, input),
      })),

    patchActivePlanContext: (input) =>
      set((state) => ({
        orchestratorRuntimeSession: patchActivePlanContext(state.orchestratorRuntimeSession, input),
      })),

    upsertActivePlanTask: (input) =>
      set((state) => ({
        orchestratorRuntimeSession: upsertActivePlanTask(state.orchestratorRuntimeSession, input),
      })),

    applyTurnTransition: (transition) => {
      const state = get()
      traceBus.emit({
        stage: 'state',
        event: 'turn_transition',
        status: transition.to === 'stopped' && transition.reason !== 'completed' ? 'error' : 'ok',
        session_id: state.sessionId,
        trace_id: state.traceId,
        turn_id: transition.turnId ?? undefined,
        span_id: createSpanId(),
        priority: 'normal',
        payload: {
          from: transition.from,
          to: transition.to,
          event: transition.event,
          reason: transition.reason,
        },
      })

      set({
        currentTurnId: transition.turnId,
        turnState: transition.to,
        turnStopReason: transition.reason ?? null,
      })
    },

    addMessage: (message: Message) => {
      const state = get()
      const persistedMessage: Message & { id: string } = message.id
        ? { ...message, id: message.id }
        : { ...message, id: `m_${messageSeq++}` }

      set((current) => ({
        messages: [...current.messages, persistedMessage],
      }))

      transcriptWriter.recordMessageAppend({
        sessionId: state.sessionId,
        traceId: state.traceId,
        turnId: state.currentTurnId ?? undefined,
        messageId: persistedMessage.id,
        role: persistedMessage.role,
        content: persistedMessage.content,
        isToolResult: persistedMessage.isToolResult === true,
      })
    },

    clearMessages: () => set({ messages: [] }),

    startStreaming: () => set({ isStreaming: true }),

    stopStreaming: () => set({ isStreaming: false, thinking: null }),

    setStreamingText: (streamingText: string | null) => set({ streamingText }),

    setThinking: (thinking: string | null) => set({ thinking }),

    appendThinking: (chunk: string) => set((state) => ({
      thinking: (state.thinking || '') + chunk,
    })),

    setError: (error: string | null) => {
      const state = get()
      traceBus.emit({
        stage: 'state',
        event: 'error',
        status: error ? 'error' : 'ok',
        session_id: state.sessionId,
        trace_id: state.traceId,
        turn_id: state.currentTurnId ?? undefined,
        span_id: createSpanId(),
        priority: error ? 'high' : 'low',
        payload: { message: error },
      })
      set({ error })
    },

    setPermissionMode: (permissionMode, meta) => {
      const state = get()
      const fromMode = state.permissionMode
      if (fromMode === permissionMode) {
        return
      }

      traceBus.emit({
        stage: 'state',
        event: 'permission_mode_switched',
        status: 'ok',
        session_id: state.sessionId,
        trace_id: state.traceId,
        turn_id: state.currentTurnId ?? undefined,
        span_id: createSpanId(),
        priority: 'normal',
        payload: {
          fromMode,
          toMode: permissionMode,
          source: meta?.source ?? 'runtime',
          command: meta?.command,
        },
      })

      set({ permissionMode })
    },

    // Permission prompt
    setPendingTool: (tool) => {
      const state = get()
      traceBus.emit({
        stage: 'permission',
        event: 'prompt',
        status: tool ? 'start' : 'ok',
        session_id: state.sessionId,
        trace_id: state.traceId,
        turn_id: state.currentTurnId ?? undefined,
        span_id: createSpanId(),
        priority: 'normal',
        payload: tool ? { toolName: tool.name } : undefined,
      })
      set({ pendingTool: tool })
    },

    resolvePendingTool: (approved: boolean) => {
      const { pendingTool } = get()
      if (pendingTool) {
        const state = get()
        traceBus.emit({
          stage: 'permission',
          event: approved ? 'allow' : 'deny',
          status: approved ? 'ok' : 'error',
          session_id: state.sessionId,
          trace_id: state.traceId,
          turn_id: state.currentTurnId ?? undefined,
          span_id: createSpanId(),
          priority: 'normal',
          payload: { toolName: pendingTool.name },
        })
        pendingTool.resolve(approved)
        set({ pendingTool: null })
      }
    },

    // Tool progress
    setToolProgress: (progress) => {
      const state = get()
      traceBus.emit({
        stage: 'state',
        event: 'tool_progress',
        status: progress?.status === 'error' ? 'error' : 'info',
        session_id: state.sessionId,
        trace_id: state.traceId,
        turn_id: state.currentTurnId ?? undefined,
        span_id: createSpanId(),
        priority: 'low',
        payload: progress
          ? {
              name: progress.name,
              status: progress.status,
              elapsedTimeSeconds: progress.elapsedTimeSeconds,
            }
          : { cleared: true },
      })
      set({ toolProgress: progress })
    },

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
