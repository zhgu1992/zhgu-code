import type { PermissionMode } from './permission.js'

// Message types
export interface TextContent {
  type: 'text'
  text: string
}

export interface ToolUseContent {
  type: 'tool_use'
  id: string
  name: string
  input: unknown
}

export interface ToolResultContent {
  type: 'tool_result'
  tool_use_id: string
  content: string | Array<{ type: string; text: string }>
  is_error?: boolean
}

export type MessageContent = string | ContentBlock[]

export interface Message {
  id?: string
  role: 'user' | 'assistant' | 'system'
  content: MessageContent
  // Mark if this is a tool result (internal, shouldn't display in UI)
  isToolResult?: boolean
}

// Stream event types
export interface TextStreamEvent {
  type: 'text'
  text: string
}

export interface ThinkingStreamEvent {
  type: 'thinking'
  thinking: string
}

export interface ToolStartStreamEvent {
  type: 'tool_start'
  id: string
  name: string
}

export interface ToolUseStartStreamEvent {
  type: 'tool_use_start'
  id: string
  name: string
  index: number
}

export interface ToolInputCompleteStreamEvent {
  type: 'tool_input_complete'
  index: number
  input: unknown
}

export interface ToolUseStreamEvent {
  type: 'tool_use'
  id: string
  name: string
  input: unknown
}

export interface DoneStreamEvent {
  type: 'done'
  inputTokens?: number
  outputTokens?: number
}

export type StreamEvent =
  | TextStreamEvent
  | ThinkingStreamEvent
  | ToolStartStreamEvent
  | ToolUseStartStreamEvent
  | ToolInputCompleteStreamEvent
  | ToolUseStreamEvent
  | DoneStreamEvent

// Message content block types
export interface TextContentBlock {
  type: 'text'
  text: string
}

export interface ThinkingContentBlock {
  type: 'thinking'
  thinking: string
}

export interface ToolUseContentBlock {
  type: 'tool_use'
  id: string
  name: string
  input: unknown
}

export interface ToolResultContentBlock {
  type: 'tool_result'
  tool_use_id: string
  content: string
  is_error?: boolean
}

export type ContentBlock =
  | TextContentBlock
  | ThinkingContentBlock
  | ToolUseContentBlock
  | ToolResultContentBlock

// Tool types
export interface ToolSchemaProperty {
  type: string
  description?: string
  enum?: string[]
  items?: ToolSchemaProperty | { type: string; properties?: Record<string, ToolSchemaProperty>; required?: string[] }
  properties?: Record<string, ToolSchemaProperty>
  required?: string[]
  default?: unknown
  minItems?: number
  maxItems?: number
}

export interface Tool<D = unknown, R = unknown, S = unknown> {
  name: string
  description: string
  safeToRetry?: boolean
  inputSchema: {
    type: 'object'
    properties: Record<string, ToolSchemaProperty>
    required?: string[]
  }
  execute: (input: D, context: ToolContext, store?: S) => Promise<R>
}

export interface ToolContext {
  cwd: string
  permissionMode: PermissionMode
}

// API types
export interface APIClientOptions {
  apiKey?: string
  baseURL?: string
}

export interface SystemPromptCacheControl {
  type: 'ephemeral'
}

export interface SystemPromptBlock {
  type: 'text'
  text: string
  cache_control?: SystemPromptCacheControl
}

export interface MessageParams {
  model: string
  max_tokens: number
  system?: string | SystemPromptBlock[]
  messages: Array<{
    role: 'user' | 'assistant' | 'system'
    content: unknown
  }>
  tools?: unknown[]
}
