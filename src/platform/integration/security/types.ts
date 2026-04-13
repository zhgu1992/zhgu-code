import type { McpLifecycleSnapshot } from "../mcp/types.js";
import type { PluginSkillLoaderSnapshot } from "../plugin/types.js";
import type { CapabilityDescriptor, CapabilityReason } from "../registry/types.js";

export type IntegrationSecurityDecision = "allow" | "deny" | "degrade";

export interface IntegrationSecurityGuardReason extends CapabilityReason {
  reasonCode:
    | "security_unknown_source"
    | "security_untrusted_source"
    | "security_transport_not_allowed"
    | "security_default_deny"
    | "security_degraded"
    | "integration_circuit_open";
}

export interface IntegrationSecurityGuardPolicy {
  trustedMcpProviders?: string[];
  trustedPlugins?: string[];
  trustedSkills?: string[];
  allowedTransports?: string[];
}

export interface IntegrationSecurityGuardInput {
  mcpSnapshots: McpLifecycleSnapshot[];
  pluginSnapshot?: PluginSkillLoaderSnapshot;
  externalCapabilities?: import("../registry/types.js").ExternalCapabilityInput[];
  policy?: IntegrationSecurityGuardPolicy;
}

export interface IntegrationSecurityGuardDecision {
  capabilityId: string;
  decision: IntegrationSecurityDecision;
  reason?: IntegrationSecurityGuardReason;
}

export interface IntegrationSecurityGuard {
  evaluate(
    input: IntegrationSecurityGuardInput,
    capabilities: CapabilityDescriptor[],
  ): IntegrationSecurityGuardDecision[];
}

export interface IntegrationCircuitBreakerConfig {
  failureThreshold?: number;
  cooldownMs?: number;
}

export interface IntegrationCircuitSnapshot {
  scope: string;
  state: "closed" | "open" | "half-open";
  consecutiveFailures: number;
  lastChangedAt: string;
}

export interface IntegrationCircuitStateChange {
  scope: string;
  from: "closed" | "open" | "half-open";
  to: "closed" | "open" | "half-open";
  changedAt: string;
}

export interface IntegrationCircuitBreaker {
  recordSuccess(scope: string, now?: Date): void;
  recordFailure(scope: string, now?: Date): void;
  getSnapshot(scope: string, now?: Date): IntegrationCircuitSnapshot;
  listSnapshots(now?: Date): IntegrationCircuitSnapshot[];
}

export interface IntegrationSecurityContext {
  guard?: IntegrationSecurityGuardInput;
  circuitBreaker?: IntegrationCircuitBreakerConfig;
}
