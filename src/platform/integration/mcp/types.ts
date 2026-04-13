export type McpLifecycleState =
  | 'disconnected'
  | 'connecting'
  | 'ready'
  | 'degraded'
  | 'disabled'

export interface McpStructuredReason {
  source: 'mcp'
  module: string
  reasonCode: string
  userMessage: string
  retryable: boolean
  detail?: string
}

export interface McpLifecycleSnapshot {
  providerId: string
  state: McpLifecycleState
  attempt: number
  updatedAt: string
  lastReason?: McpStructuredReason
}

export interface McpLifecycleTransition {
  ts: string
  providerId: string
  from: McpLifecycleState
  to: McpLifecycleState
  attempt: number
  reason?: McpStructuredReason
}

export interface McpLifecycleAuditEvent {
  ts: string
  source: 'mcp'
  module: string
  providerId: string
  event: 'mcp.lifecycle.transition'
  from: McpLifecycleState
  to: McpLifecycleState
  attempt: number
  reason?: McpStructuredReason
}

export interface McpErrorClassification {
  reasonCode: string
  userMessage: string
  retryable: boolean
  detail?: string
}

export interface McpLifecycleManager {
  connect(): Promise<McpLifecycleSnapshot>
  disable(reason?: Omit<McpStructuredReason, 'source' | 'module'>): McpLifecycleSnapshot
  getSnapshot(): McpLifecycleSnapshot
  canSchedule(): boolean
}
