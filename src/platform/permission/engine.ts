import type {
  PermissionAction,
  PermissionDecision,
  PermissionRequest,
  PermissionRule,
  PermissionScope,
  PermissionSource,
} from "./index.js";

const ACTION_PRIORITY: Record<PermissionAction, number> = {
  deny: 3,
  ask: 2,
  allow: 1,
};

const SCOPE_PRIORITY: Record<PermissionScope, number> = {
  tool: 2,
  global: 1,
};

const SOURCE_PRIORITY: Record<PermissionSource, number> = {
  session: 3,
  user: 2,
  default: 1,
};

interface RankedRule {
  rule: PermissionRule;
  index: number;
  scope: PermissionScope;
}

export function evaluatePermission(
  rules: PermissionRule[],
  request: PermissionRequest,
): PermissionDecision {
  const matched = rules
    .map((rule, index): RankedRule | null => {
      const scope = resolveScope(rule);
      if (!matchesRule(rule, scope, request)) {
        return null;
      }
      return { rule, index, scope };
    })
    .filter((candidate): candidate is RankedRule => candidate !== null);

  if (matched.length === 0) {
    return {
      action: "ask",
      allowed: false,
      reason: "No matching permission rule; default to ask",
      matchedRuleIds: [],
    };
  }

  const sorted = [...matched].sort((left, right) => {
    const byAction = ACTION_PRIORITY[right.rule.action] - ACTION_PRIORITY[left.rule.action];
    if (byAction !== 0) return byAction;

    const byScope = SCOPE_PRIORITY[right.scope] - SCOPE_PRIORITY[left.scope];
    if (byScope !== 0) return byScope;

    const bySource = SOURCE_PRIORITY[right.rule.source] - SOURCE_PRIORITY[left.rule.source];
    if (bySource !== 0) return bySource;

    return left.index - right.index;
  });

  const winner = sorted[0];

  return {
    action: winner.rule.action,
    allowed: winner.rule.action === "allow",
    reason: buildReason(winner.rule, winner.scope),
    matchedRuleIds: sorted.map((item) => item.rule.id),
  };
}

function resolveScope(rule: PermissionRule): PermissionScope {
  if (rule.scope) return rule.scope;
  return rule.toolName ? "tool" : "global";
}

function matchesRule(
  rule: PermissionRule,
  scope: PermissionScope,
  request: PermissionRequest,
): boolean {
  if (rule.riskLevel !== "any" && rule.riskLevel !== request.riskLevel) {
    return false;
  }

  if (scope === "global") {
    return true;
  }

  return rule.toolName === request.toolName;
}

function buildReason(rule: PermissionRule, scope: PermissionScope): string {
  const scopeLabel = scope === "tool" ? `tool ${rule.toolName}` : "global scope";
  return `Rule ${rule.id} (${rule.source}, ${scopeLabel}) resolved action ${rule.action}`;
}
