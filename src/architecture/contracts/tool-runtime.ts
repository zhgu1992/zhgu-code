import type { AppStore } from '../../state/store.js'

export type ToolRiskLevel = 'low' | 'medium' | 'high' | 'critical'

export interface ToolExecutionAudit {
  requestId: string
  toolName: string
  riskLevel: ToolRiskLevel
  startedAt: string
  endedAt?: string
  success: boolean
}

export interface IToolRuntime {
  execute(name: string, input: unknown, store: AppStore): Promise<string>
}
