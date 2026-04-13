import { readFile } from 'node:fs/promises'
import { describe, expect, test } from 'bun:test'
import type { Tool } from '../definitions/types/index.js'
import { createIntegrationRegistryAdapter } from '../platform/integration/registry/adapter.js'
import type {
  ExternalCapabilityInput,
  IntegrationRegistryRebuildInput,
} from '../platform/integration/registry/types.js'

function makeTool(name: string, description: string): Tool {
  return {
    name,
    description,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'query',
        },
      },
      required: ['query'],
    },
    execute: async () => 'ok',
  }
}

function createToolRegistry(tools: Tool[]): { getAll(): Tool[] } {
  return {
    getAll(): Tool[] {
      return tools
    },
  }
}

describe('WP3-C Registry Adapter', () => {
  test('REG-001: builtin and external capabilities are queryable in one registry', () => {
    const adapter = createIntegrationRegistryAdapter({
      toolRegistry: createToolRegistry([makeTool('Read', 'Read files')]),
    })

    const input: IntegrationRegistryRebuildInput = {
      mcpSnapshots: [
        {
          providerId: 'mcp.alpha',
          state: 'ready',
          attempt: 1,
          updatedAt: '2026-04-13T00:00:00.000Z',
        },
      ],
      pluginSnapshot: {
        updatedAt: '2026-04-13T00:00:00.000Z',
        items: [
          {
            id: 'plugin:alpha',
            itemType: 'plugin',
            name: 'alpha',
            path: '/tmp/plugin-alpha',
            state: 'loaded',
            loadedFrom: 'plugin',
            version: '1.0.0',
          },
          {
            id: 'bundled:core',
            itemType: 'skill',
            name: 'core',
            path: 'bundled://core',
            state: 'loaded',
            loadedFrom: 'bundled',
            version: '1.2.0',
          },
        ],
      },
    }

    adapter.rebuild(input)
    const all = adapter.listCapabilities()

    expect(all.find((item) => item.source === 'builtin' && item.name === 'Read')?.callable).toBe(true)
    expect(all.find((item) => item.source === 'mcp' && item.name === 'mcp.alpha')?.state).toBe('ready')
    expect(all.find((item) => item.source === 'plugin' && item.name === 'alpha')?.loadedFrom).toBe(
      'plugin',
    )
    expect(all.find((item) => item.source === 'skill' && item.name === 'core')?.loadedFrom).toBe(
      'bundled',
    )
  })

  test('REG-002: disabled capabilities remain visible but not callable', () => {
    const adapter = createIntegrationRegistryAdapter({
      toolRegistry: createToolRegistry([makeTool('Read', 'Read files')]),
    })

    adapter.rebuild({
      mcpSnapshots: [
        {
          providerId: 'mcp.disabled',
          state: 'disabled',
          attempt: 2,
          updatedAt: '2026-04-13T00:00:00.000Z',
          lastReason: {
            source: 'mcp',
            module: 'platform.integration.mcp.lifecycle',
            reasonCode: 'retry_exhausted',
            userMessage: 'MCP retries exhausted.',
            retryable: false,
          },
        },
      ],
      pluginSnapshot: {
        updatedAt: '2026-04-13T00:00:00.000Z',
        items: [
          {
            id: 'plugin:disabled',
            itemType: 'plugin',
            name: 'disabled-plugin',
            path: '/tmp/plugin-disabled',
            state: 'disabled',
            loadedFrom: 'plugin',
            reason: {
              source: 'plugin',
              module: 'platform.integration.plugin.loader',
              reasonCode: 'manifest_invalid',
              userMessage: 'Manifest invalid.',
              retryable: false,
            },
          },
        ],
      },
    })

    const disabled = adapter.listCapabilities({ callable: false })
    const mcp = disabled.find((item) => item.name === 'mcp.disabled')
    const plugin = disabled.find((item) => item.id === 'plugin:disabled')

    expect(mcp?.state).toBe('disabled')
    expect(mcp?.reason?.reasonCode).toBe('retry_exhausted')
    expect(plugin?.state).toBe('disabled')
    expect(plugin?.reason?.reasonCode).toBe('manifest_invalid')
  })

  test('REG-003: name conflict keeps both capabilities and preserves builtin model tool', () => {
    const adapter = createIntegrationRegistryAdapter({
      toolRegistry: createToolRegistry([makeTool('Search', 'Builtin Search')]),
    })

    const externalCapabilities: ExternalCapabilityInput[] = [
      {
        id: 'mcp.search',
        name: 'External Search',
        source: 'mcp',
        type: 'tool',
        state: 'ready',
        callable: true,
        modelTool: {
          name: 'Search',
          description: 'External Search',
          input_schema: {
            type: 'object',
            properties: {
              query: { type: 'string' },
            },
          },
        },
      },
    ]

    const summary = adapter.rebuild({ externalCapabilities })

    const toolCapabilities = adapter.listCapabilities({ type: 'tool' })
    const searchCapabilities = toolCapabilities.filter((item) => item.modelTool?.name === 'Search')
    const modelTools = adapter.listModelCallableTools().filter((tool) => tool.name === 'Search')

    expect(searchCapabilities.length).toBe(2)
    expect(new Set(searchCapabilities.map((item) => item.capabilityId)).size).toBe(2)
    expect(modelTools.length).toBe(1)
    expect(modelTools[0]?.description).toBe('Builtin Search')
    expect(summary.conflicts).toBe(1)
  })

  test('REG-004: query/tool runtime consume registry adapter entry points', async () => {
    const queryRunnerSource = await readFile(
      new URL('../application/query/query-runner.ts', import.meta.url),
      'utf8',
    )
    const toolRuntimeSource = await readFile(
      new URL('../application/query/tool-orchestrator.ts', import.meta.url),
      'utf8',
    )

    expect(queryRunnerSource).toContain('createIntegrationRegistryAdapter')
    expect(queryRunnerSource).toContain('integrationRegistry.listModelCallableTools()')
    expect(queryRunnerSource).not.toContain('tools.toAPISchema()')

    expect(toolRuntimeSource).toContain('resolveToolCall(call.name)')
    expect(toolRuntimeSource).toContain('registry_not_callable')
  })
})
