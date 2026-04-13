import type { PluginSkillLoadItem } from "../plugin/types.js";
import type { CapabilityDescriptor } from "../registry/types.js";
import type {
  IntegrationSecurityGuard,
  IntegrationSecurityGuardDecision,
  IntegrationSecurityGuardInput,
  IntegrationSecurityGuardPolicy,
  IntegrationSecurityGuardReason,
} from "./types.js";

const DEFAULT_MODULE = "platform.integration.security.guard";
const DEFAULT_ALLOWED_TRANSPORTS = ["stdio"];

export interface CreateIntegrationSecurityGuardOptions {
  module?: string;
}

export function createIntegrationSecurityGuard(
  options: CreateIntegrationSecurityGuardOptions = {},
): IntegrationSecurityGuard {
  const moduleName = options.module ?? DEFAULT_MODULE;

  return {
    evaluate(
      input: IntegrationSecurityGuardInput,
      capabilities: CapabilityDescriptor[],
    ): IntegrationSecurityGuardDecision[] {
      const policy = normalizePolicy(input.policy);
      const knownMcpProviders = new Set(input.mcpSnapshots.map((item) => item.providerId));
      const pluginItems = input.pluginSnapshot?.items ?? [];
      const knownPluginIds = collectKnownPluginIds(pluginItems);
      const knownSkillIds = new Set(
        pluginItems.filter((item) => item.itemType === "skill").map((item) => item.id),
      );

      return capabilities
        .filter((capability) => capability.source !== "builtin")
        .map((capability) => {
          const sourceCheck = decideSource(
            capability,
            moduleName,
            policy,
            knownMcpProviders,
            knownPluginIds,
            knownSkillIds,
          );
          if (sourceCheck) {
            return sourceCheck;
          }

          if (capability.transport && !policy.allowedTransports.has(capability.transport)) {
            return {
              capabilityId: capability.capabilityId,
              decision: "deny",
              reason: makeReason({
                source: capability.source,
                module: moduleName,
                reasonCode: "security_transport_not_allowed",
                userMessage: `Capability transport is not allowed: ${capability.transport}`,
                retryable: false,
                detail: capability.transport,
              }),
            };
          }

          if (capability.state === "degraded") {
            return {
              capabilityId: capability.capabilityId,
              decision: "degrade",
              reason: makeReason({
                source: capability.source,
                module: moduleName,
                reasonCode: "security_degraded",
                userMessage: `Capability ${capability.name} is degraded and temporarily not callable.`,
                retryable: true,
              }),
            };
          }

          return {
            capabilityId: capability.capabilityId,
            decision: "allow",
          };
        });
    },
  };
}

interface NormalizedPolicy {
  trustedMcpProviders: Set<string>;
  trustedPlugins: Set<string>;
  trustedSkills: Set<string>;
  allowedTransports: Set<string>;
}

function normalizePolicy(policy?: IntegrationSecurityGuardPolicy): NormalizedPolicy {
  return {
    trustedMcpProviders: new Set(policy?.trustedMcpProviders ?? []),
    trustedPlugins: new Set(policy?.trustedPlugins ?? []),
    trustedSkills: new Set(policy?.trustedSkills ?? []),
    allowedTransports: new Set(policy?.allowedTransports ?? DEFAULT_ALLOWED_TRANSPORTS),
  };
}

function collectKnownPluginIds(items: PluginSkillLoadItem[]): Set<string> {
  const ids = new Set<string>();
  for (const item of items) {
    if (item.itemType === "plugin") {
      ids.add(item.id);
      if (item.pluginId) {
        ids.add(item.pluginId);
      }
    }
    if (item.itemType === "skill" && item.pluginId) {
      ids.add(item.pluginId);
    }
  }
  return ids;
}

function decideSource(
  capability: CapabilityDescriptor,
  module: string,
  policy: NormalizedPolicy,
  knownMcpProviders: Set<string>,
  knownPluginIds: Set<string>,
  knownSkillIds: Set<string>,
): IntegrationSecurityGuardDecision | null {
  if (capability.source === "mcp") {
    const providerId = capability.providerId ?? capability.id;
    if (!providerId || !knownMcpProviders.has(providerId)) {
      return deny(
        capability,
        module,
        "security_unknown_source",
        `Unknown MCP provider: ${providerId ?? capability.id}`,
      );
    }
    if (!policy.trustedMcpProviders.has(providerId)) {
      return deny(
        capability,
        module,
        "security_untrusted_source",
        `MCP provider is not trusted by policy: ${providerId}`,
      );
    }
    return null;
  }

  if (capability.source === "plugin") {
    const pluginId = capability.pluginId ?? capability.id;
    if (!pluginId || !knownPluginIds.has(pluginId)) {
      return deny(
        capability,
        module,
        "security_unknown_source",
        `Unknown plugin source: ${pluginId ?? capability.id}`,
      );
    }
    if (!policy.trustedPlugins.has(pluginId)) {
      return deny(
        capability,
        module,
        "security_untrusted_source",
        `Plugin is not trusted by policy: ${pluginId}`,
      );
    }
    return null;
  }

  if (capability.source === "skill") {
    const skillId = capability.id;
    if (!knownSkillIds.has(skillId)) {
      return deny(
        capability,
        module,
        "security_unknown_source",
        `Unknown skill source: ${skillId}`,
      );
    }
    if (!policy.trustedSkills.has(skillId)) {
      return deny(
        capability,
        module,
        "security_untrusted_source",
        `Skill is not trusted by policy: ${skillId}`,
      );
    }
  }

  return null;
}

function deny(
  capability: CapabilityDescriptor,
  module: string,
  reasonCode: IntegrationSecurityGuardReason["reasonCode"],
  userMessage: string,
): IntegrationSecurityGuardDecision {
  return {
    capabilityId: capability.capabilityId,
    decision: "deny",
    reason: makeReason({
      source: capability.source,
      module,
      reasonCode,
      userMessage,
      retryable: false,
    }),
  };
}

function makeReason(reason: IntegrationSecurityGuardReason): IntegrationSecurityGuardReason {
  return reason;
}
