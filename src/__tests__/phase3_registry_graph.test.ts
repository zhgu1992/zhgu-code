import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Tool } from "../definitions/types/index.js";
import {
  buildIntegrationGraphView,
  loadLatestIntegrationGraphSnapshotFromTrace,
} from "../application/query/context-view.js";
import { createIntegrationRegistryAdapter } from "../platform/integration/registry/adapter.js";
import { buildIntegrationRegistryGraphSnapshot } from "../platform/integration/registry/graph.js";

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

const tempDirs: string[] = [];

describe("WP3-F Registry Graph", () => {
  test("VIS-001/003: graph includes mixed sources and conflict group with builtin owner", () => {
    const adapter = createIntegrationRegistryAdapter({
      toolRegistry: createToolRegistry([makeTool("Search", "Builtin Search")]),
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
      pluginSnapshot: {
        updatedAt: "2026-04-13T00:00:00.000Z",
        items: [
          {
            id: "plugin:alpha",
            itemType: "plugin",
            name: "alpha",
            path: "/tmp/plugin-alpha",
            state: "loaded",
            loadedFrom: "plugin",
            version: "1.0.0",
          },
          {
            id: "skill:alpha-helper",
            itemType: "skill",
            pluginId: "plugin:alpha",
            name: "alpha-helper",
            path: "/tmp/plugin-alpha/skills/alpha-helper",
            state: "loaded",
            loadedFrom: "plugin",
            version: "1.0.0",
          },
        ],
      },
      externalCapabilities: [
        {
          id: "tool.alpha.search",
          name: "MCP Search",
          source: "mcp",
          type: "tool",
          providerId: "mcp.alpha",
          transport: "stdio",
          state: "ready",
          callable: true,
          modelTool: {
            name: "Search",
            description: "MCP Search",
            input_schema: {
              type: "object",
              properties: {
                query: { type: "string" },
              },
            },
          },
        },
      ],
      security: {
        guard: {
          mcpSnapshots: [],
          policy: {
            trustedMcpProviders: ["mcp.alpha"],
            trustedPlugins: ["plugin:alpha"],
            allowedTransports: ["stdio"],
          },
        },
      },
    });

    const snapshot = buildIntegrationRegistryGraphSnapshot({
      capabilities: adapter.listCapabilities(),
      modelCallableTools: adapter.listModelCallableTools(),
    });

    expect(snapshot.summary.total).toBe(5);
    expect(snapshot.summary.sourceCounts).toEqual({
      builtin: 1,
      mcp: 2,
      plugin: 1,
      skill: 1,
    });
    expect(snapshot.edges).toEqual(
      expect.arrayContaining([
        {
          from: "mcp:tool:tool.alpha.search",
          to: "mcp:provider:mcp.alpha",
          relation: "belongs_to_provider",
        },
        {
          from: "skill:skill:skill:alpha-helper",
          to: "plugin:plugin:plugin:alpha",
          relation: "belongs_to_plugin",
        },
      ]),
    );

    expect(snapshot.conflictGroups).toHaveLength(1);
    expect(snapshot.conflictGroups[0]).toEqual({
      toolName: "Search",
      ownerCapabilityId: "builtin:tool:Search",
      candidateCapabilityIds: ["builtin:tool:Search", "mcp:tool:tool.alpha.search"],
      resolutionPolicy: "builtin_preferred",
    });
  });

  test("VIS-002: disabled item remains visible and callable=false", () => {
    const snapshot = buildIntegrationRegistryGraphSnapshot({
      capabilities: [
        {
          capabilityId: "mcp:provider:mcp.disabled",
          id: "mcp.disabled",
          name: "mcp.disabled",
          type: "provider",
          source: "mcp",
          state: "disabled",
          callable: false,
          reason: {
            source: "mcp",
            module: "platform.integration.mcp.lifecycle",
            reasonCode: "retry_exhausted",
            userMessage: "MCP retries exhausted.",
            retryable: false,
          },
        },
      ],
      modelCallableTools: [],
    });

    expect(snapshot.nodes).toHaveLength(1);
    expect(snapshot.nodes[0]).toMatchObject({
      capabilityId: "mcp:provider:mcp.disabled",
      state: "disabled",
      callable: false,
      reasonCode: "retry_exhausted",
    });
  });

  test("VIS-004: builtin-only graph degrades safely with empty edges/conflicts", () => {
    const snapshot = buildIntegrationRegistryGraphSnapshot({
      capabilities: [
        {
          capabilityId: "builtin:tool:Read",
          id: "Read",
          name: "Read",
          type: "tool",
          source: "builtin",
          state: "ready",
          callable: true,
          modelTool: {
            name: "Read",
            description: "Read files",
            input_schema: { type: "object" },
          },
        },
      ],
      modelCallableTools: [
        {
          name: "Read",
          description: "Read files",
          input_schema: { type: "object" },
        },
      ],
    });

    expect(snapshot.summary).toEqual({
      total: 1,
      callable: 1,
      disabled: 0,
      conflicts: 0,
      sourceCounts: {
        builtin: 1,
        mcp: 0,
        plugin: 0,
        skill: 0,
      },
    });
    expect(snapshot.edges).toEqual([]);
    expect(snapshot.conflictGroups).toEqual([]);
  });

  test("VIS-005: context-view can read latest integration graph snapshot from trace", async () => {
    const dir = await mkdtemp(join(tmpdir(), "wp3f-vis005-"));
    tempDirs.push(dir);
    const tracePath = join(dir, "trace.jsonl");
    const snapshot = buildIntegrationRegistryGraphSnapshot({
      capabilities: [
        {
          capabilityId: "builtin:tool:Read",
          id: "Read",
          name: "Read",
          type: "tool",
          source: "builtin",
          state: "ready",
          callable: true,
          modelTool: {
            name: "Read",
            description: "Read files",
            input_schema: { type: "object" },
          },
        },
      ],
      modelCallableTools: [
        {
          name: "Read",
          description: "Read files",
          input_schema: { type: "object" },
        },
      ],
    });
    await writeFile(
      tracePath,
      `${JSON.stringify({
        ts: "2026-04-13T09:00:00.000Z",
        stage: "provider",
        event: "integration_registry_graph_snapshot",
        status: "ok",
        session_id: "sess_wp3f",
        trace_id: "trace_wp3f",
        span_id: "span_wp3f",
        payload: {
          total: snapshot.summary.total,
          callable: snapshot.summary.callable,
          disabled: snapshot.summary.disabled,
          conflicts: snapshot.summary.conflicts,
          sourceCounts: snapshot.summary.sourceCounts,
          conflictGroupCount: snapshot.conflictGroups.length,
          snapshot,
        },
      })}\n`,
      "utf8",
    );

    const record = await loadLatestIntegrationGraphSnapshotFromTrace(tracePath);
    const view = buildIntegrationGraphView(record);

    expect(view.type).toBe("snapshot");
    expect(view).toMatchObject({
      type: "snapshot",
      summary: snapshot.summary,
      updatedAt: "2026-04-13T09:00:00.000Z",
    });
  });
});

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0, tempDirs.length).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});
