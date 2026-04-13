import { describe, expect, test } from "bun:test";
import type { Tool } from "../definitions/types/index.js";
import { createIntegrationRegistryAdapter } from "../platform/integration/registry/adapter.js";
import type { ExternalCapabilityInput } from "../platform/integration/registry/types.js";
import { createIntegrationCircuitBreaker } from "../platform/integration/security/circuit-breaker.js";

function makeTool(name: string, description: string): Tool {
  return {
    name,
    description,
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "query",
        },
      },
      required: ["query"],
    },
    execute: async () => "ok",
  };
}

function createToolRegistry(tools: Tool[]): { getAll(): Tool[] } {
  return {
    getAll(): Tool[] {
      return tools;
    },
  };
}

function createMcpToolCapability(
  id: string,
  providerId: string,
  toolName: string,
  transport = "stdio",
): ExternalCapabilityInput {
  return {
    id,
    name: id,
    source: "mcp",
    type: "tool",
    providerId,
    transport,
    state: "ready",
    callable: true,
    modelTool: {
      name: toolName,
      description: `${toolName} from ${providerId}`,
      input_schema: {
        type: "object",
        properties: {
          query: { type: "string" },
        },
      },
    },
  };
}

describe("WP3-D Integration Security", () => {
  test("SEC-001: unknown provider is visible but denied for callable surface", () => {
    const adapter = createIntegrationRegistryAdapter({
      toolRegistry: createToolRegistry([makeTool("Read", "Read files")]),
    });

    adapter.rebuild({
      mcpSnapshots: [
        {
          providerId: "mcp.alpha",
          state: "ready",
          attempt: 1,
          updatedAt: "2026-04-13T00:00:00.000Z",
        },
      ],
      externalCapabilities: [
        createMcpToolCapability("tool.unknown", "mcp.unknown", "ExternalRead"),
      ],
      security: {
        guard: {
          mcpSnapshots: [],
          policy: {
            trustedMcpProviders: ["mcp.alpha"],
            allowedTransports: ["stdio"],
          },
        },
      },
    });

    const denied = adapter.getCapability("mcp:tool:tool.unknown");
    expect(denied?.callable).toBe(false);
    expect(denied?.reason?.reasonCode).toBe("security_unknown_source");
    expect(
      adapter.listModelCallableTools().find((item) => item.name === "ExternalRead"),
    ).toBeUndefined();
  });

  test("SEC-002: non-allowlisted transport is denied with structured reason", () => {
    const adapter = createIntegrationRegistryAdapter({
      toolRegistry: createToolRegistry([makeTool("Read", "Read files")]),
    });

    adapter.rebuild({
      mcpSnapshots: [
        {
          providerId: "mcp.alpha",
          state: "ready",
          attempt: 1,
          updatedAt: "2026-04-13T00:00:00.000Z",
        },
      ],
      externalCapabilities: [
        createMcpToolCapability("tool.alpha", "mcp.alpha", "ExternalSearch", "sse"),
      ],
      security: {
        guard: {
          mcpSnapshots: [],
          policy: {
            trustedMcpProviders: ["mcp.alpha"],
            allowedTransports: ["stdio"],
          },
        },
      },
    });

    const denied = adapter.getCapability("mcp:tool:tool.alpha");
    expect(denied?.callable).toBe(false);
    expect(denied?.reason?.reasonCode).toBe("security_transport_not_allowed");
  });

  test("SEC-003: circuit opening on one provider does not block builtin or other provider", () => {
    const breaker = createIntegrationCircuitBreaker({
      failureThreshold: 3,
      cooldownMs: 30_000,
    });
    const adapter = createIntegrationRegistryAdapter({
      toolRegistry: createToolRegistry([makeTool("Read", "Read files")]),
      circuitBreaker: breaker,
    });

    for (let i = 0; i < 3; i += 1) {
      adapter.rebuild({
        mcpSnapshots: [
          {
            providerId: "mcp.alpha",
            state: "degraded",
            attempt: i + 1,
            updatedAt: "2026-04-13T00:00:00.000Z",
          },
          {
            providerId: "mcp.beta",
            state: "ready",
            attempt: 1,
            updatedAt: "2026-04-13T00:00:00.000Z",
          },
        ],
        externalCapabilities: [
          createMcpToolCapability("tool.alpha", "mcp.alpha", "AlphaSearch"),
          createMcpToolCapability("tool.beta", "mcp.beta", "BetaSearch"),
        ],
        security: {
          guard: {
            mcpSnapshots: [],
            policy: {
              trustedMcpProviders: ["mcp.alpha", "mcp.beta"],
              allowedTransports: ["stdio"],
            },
          },
        },
      });
    }

    const alpha = adapter.getCapability("mcp:tool:tool.alpha");
    const beta = adapter.getCapability("mcp:tool:tool.beta");
    const builtin = adapter.getCapability("builtin:tool:Read");

    expect(alpha?.callable).toBe(false);
    expect(alpha?.reason?.reasonCode).toBe("integration_circuit_open");
    expect(beta?.callable).toBe(true);
    expect(builtin?.callable).toBe(true);

    const modelToolNames = adapter.listModelCallableTools().map((item) => item.name);
    expect(modelToolNames).toContain("Read");
    expect(modelToolNames).toContain("BetaSearch");
    expect(modelToolNames).not.toContain("AlphaSearch");
  });

  test("SEC-004: open circuit can recover after cooldown and re-open after failed probe", async () => {
    const breaker = createIntegrationCircuitBreaker({
      failureThreshold: 2,
      cooldownMs: 5,
    });
    const adapter = createIntegrationRegistryAdapter({
      toolRegistry: createToolRegistry([makeTool("Read", "Read files")]),
      circuitBreaker: breaker,
    });

    const baseInput = {
      externalCapabilities: [createMcpToolCapability("tool.alpha", "mcp.alpha", "AlphaSearch")],
      security: {
        guard: {
          mcpSnapshots: [],
          policy: {
            trustedMcpProviders: ["mcp.alpha"],
            allowedTransports: ["stdio"],
          },
        },
      },
    };

    adapter.rebuild({
      ...baseInput,
      mcpSnapshots: [
        {
          providerId: "mcp.alpha",
          state: "degraded",
          attempt: 1,
          updatedAt: "2026-04-13T00:00:00.000Z",
        },
      ],
    });
    adapter.rebuild({
      ...baseInput,
      mcpSnapshots: [
        {
          providerId: "mcp.alpha",
          state: "degraded",
          attempt: 2,
          updatedAt: "2026-04-13T00:00:00.000Z",
        },
      ],
    });

    expect(adapter.getCapability("mcp:tool:tool.alpha")?.reason?.reasonCode).toBe(
      "integration_circuit_open",
    );

    await new Promise((resolve) => setTimeout(resolve, 10));

    adapter.rebuild({
      ...baseInput,
      mcpSnapshots: [
        {
          providerId: "mcp.alpha",
          state: "ready",
          attempt: 3,
          updatedAt: "2026-04-13T00:00:00.000Z",
        },
      ],
    });

    expect(adapter.getCapability("mcp:tool:tool.alpha")?.callable).toBe(true);

    adapter.rebuild({
      ...baseInput,
      mcpSnapshots: [
        {
          providerId: "mcp.alpha",
          state: "degraded",
          attempt: 4,
          updatedAt: "2026-04-13T00:00:00.000Z",
        },
      ],
    });
    adapter.rebuild({
      ...baseInput,
      mcpSnapshots: [
        {
          providerId: "mcp.alpha",
          state: "degraded",
          attempt: 5,
          updatedAt: "2026-04-13T00:00:00.000Z",
        },
      ],
    });

    const reopened = adapter.getCapability("mcp:tool:tool.alpha");
    expect(reopened?.callable).toBe(false);
    expect(reopened?.reason?.reasonCode).toBe("integration_circuit_open");
  });
});
