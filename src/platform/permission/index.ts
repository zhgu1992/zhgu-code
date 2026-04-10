import type { ToolRiskLevel } from "../../architecture/contracts/tool-runtime.js";

export type PermissionAction = "allow" | "deny" | "ask";
export type PermissionSource = "default" | "user" | "session";
export type PermissionScope = "global" | "tool";

export interface PermissionRule {
  id: string;
  action: PermissionAction;
  source: PermissionSource;
  riskLevel: ToolRiskLevel | "any";
  scope?: PermissionScope;
  toolName?: string;
}

export interface PermissionRequest {
  toolName: string;
  riskLevel: ToolRiskLevel;
}

export interface PermissionDecision {
  action: PermissionAction;
  allowed: boolean;
  reason: string;
  matchedRuleIds: string[];
}

export interface ToolRiskAssessment {
  baselineLevel: ToolRiskLevel;
  riskLevel: ToolRiskLevel;
  reasonCodes: string[];
}
