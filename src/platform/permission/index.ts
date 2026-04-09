import type { ToolRiskLevel } from '../../architecture/contracts/tool-runtime.js'

export interface PermissionRule {
  id: string
  toolName: string
  riskLevel: ToolRiskLevel
  action: 'allow' | 'deny' | 'ask'
  source: 'default' | 'user' | 'session'
}

export interface PermissionDecision {
  allowed: boolean
  action: 'allow' | 'deny' | 'ask'
  reason: string
}
