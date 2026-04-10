import { describe, expect, test } from "bun:test";
import { evaluatePermission } from "../platform/permission/engine.js";
import type { PermissionRule } from "../platform/permission/index.js";

const request = {
  toolName: "Bash",
  riskLevel: "high",
} as const;

describe("Phase 2 Permission Engine (wip2-02 / WP2-A)", () => {
  test("PRE-001: deny should win when allow and deny both match", () => {
    const rules: PermissionRule[] = [
      {
        id: "allow-default",
        action: "allow",
        source: "default",
        scope: "global",
        riskLevel: "any",
      },
      {
        id: "deny-session",
        action: "deny",
        source: "session",
        scope: "tool",
        toolName: "Bash",
        riskLevel: "high",
      },
    ];

    const decision = evaluatePermission(rules, request);

    expect(decision.action).toBe("deny");
    expect(decision.allowed).toBe(false);
    expect(decision.matchedRuleIds).toEqual(["deny-session", "allow-default"]);
  });

  test("PRE-002: tool scope should override global scope", () => {
    const rules: PermissionRule[] = [
      {
        id: "ask-global",
        action: "ask",
        source: "user",
        scope: "global",
        riskLevel: "high",
      },
      {
        id: "ask-tool",
        action: "ask",
        source: "user",
        scope: "tool",
        toolName: "Bash",
        riskLevel: "high",
      },
    ];

    const decision = evaluatePermission(rules, request);

    expect(decision.action).toBe("ask");
    expect(decision.allowed).toBe(false);
    expect(decision.matchedRuleIds).toEqual(["ask-tool", "ask-global"]);
  });

  test("PRE-003: session source should override user/default for same action", () => {
    const rules: PermissionRule[] = [
      {
        id: "allow-default",
        action: "allow",
        source: "default",
        scope: "tool",
        toolName: "Bash",
        riskLevel: "high",
      },
      {
        id: "allow-user",
        action: "allow",
        source: "user",
        scope: "tool",
        toolName: "Bash",
        riskLevel: "high",
      },
      {
        id: "allow-session",
        action: "allow",
        source: "session",
        scope: "tool",
        toolName: "Bash",
        riskLevel: "high",
      },
    ];

    const decision = evaluatePermission(rules, request);

    expect(decision.action).toBe("allow");
    expect(decision.allowed).toBe(true);
    expect(decision.matchedRuleIds).toEqual(["allow-session", "allow-user", "allow-default"]);
  });

  test("PRE-004: no match should fallback to ask", () => {
    const rules: PermissionRule[] = [
      {
        id: "other-tool-allow",
        action: "allow",
        source: "session",
        scope: "tool",
        toolName: "Read",
        riskLevel: "high",
      },
      {
        id: "critical-only-deny",
        action: "deny",
        source: "default",
        scope: "global",
        riskLevel: "critical",
      },
    ];

    const decision = evaluatePermission(rules, request);

    expect(decision.action).toBe("ask");
    expect(decision.allowed).toBe(false);
    expect(decision.matchedRuleIds).toEqual([]);
  });
});
