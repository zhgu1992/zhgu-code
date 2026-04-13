import { describe, expect, test } from 'bun:test'
import { createMcpLifecycleManager } from '../platform/integration/mcp/lifecycle.js'
import type {
  McpLifecycleAuditEvent,
  McpLifecycleTransition,
} from '../platform/integration/mcp/types.js'

describe('WP3-A MCP Lifecycle', () => {
  test('MCP-001: first connect success enters ready', async () => {
    const transitions: McpLifecycleTransition[] = []
    const audits: McpLifecycleAuditEvent[] = []
    let connectCalls = 0

    const manager = createMcpLifecycleManager({
      providerId: 'mcp.test',
      sessionId: 'sess_001',
      traceId: 'trace_001',
      connect: async () => {
        connectCalls += 1
      },
      onTransition: (transition) => transitions.push(transition),
      onAudit: (event) => audits.push(event),
    })

    const finalSnapshot = await manager.connect()

    expect(finalSnapshot.state).toBe('ready')
    expect(finalSnapshot.attempt).toBe(1)
    expect(connectCalls).toBe(1)
    expect(manager.canSchedule()).toBe(true)
    expect(transitions.map((item) => item.to)).toEqual(['connecting', 'ready'])
    expect(audits.length).toBe(2)
    expect(audits[1]?.to).toBe('ready')
  })

  test('MCP-002: connect unavailable enters degraded with structured reason', async () => {
    const manager = createMcpLifecycleManager({
      providerId: 'mcp.degraded',
      sessionId: 'sess_002',
      traceId: 'trace_002',
      maxRetries: 0,
      connect: async () => {
        throw new Error('ECONNREFUSED')
      },
      classifyError: () => ({
        reasonCode: 'connection_refused',
        userMessage: 'MCP endpoint is not reachable.',
        retryable: true,
      }),
    })

    const finalSnapshot = await manager.connect()

    expect(finalSnapshot.state).toBe('disabled')
    expect(finalSnapshot.lastReason).toBeDefined()
    expect(finalSnapshot.lastReason?.source).toBe('mcp')
    expect(finalSnapshot.lastReason?.module).toBe('platform.integration.mcp.lifecycle')
    expect(finalSnapshot.lastReason?.reasonCode).toBe('retry_exhausted')
    expect(finalSnapshot.lastReason?.userMessage).toContain('retries exhausted')
  })

  test('MCP-003: retry exhausted enters disabled', async () => {
    let connectCalls = 0
    const transitions: McpLifecycleTransition[] = []

    const manager = createMcpLifecycleManager({
      providerId: 'mcp.retry',
      sessionId: 'sess_003',
      traceId: 'trace_003',
      maxRetries: 1,
      connect: async () => {
        connectCalls += 1
        throw new Error('temporary timeout')
      },
      classifyError: () => ({
        reasonCode: 'connect_timeout',
        userMessage: 'Timeout while connecting to MCP provider.',
        retryable: true,
      }),
      onTransition: (transition) => transitions.push(transition),
    })

    const finalSnapshot = await manager.connect()

    expect(connectCalls).toBe(2)
    expect(finalSnapshot.state).toBe('disabled')
    expect(finalSnapshot.attempt).toBe(2)
    expect(finalSnapshot.lastReason?.reasonCode).toBe('retry_exhausted')
    expect(transitions.at(-1)?.to).toBe('disabled')
    expect(manager.canSchedule()).toBe(false)
  })

  test('MCP-004: disabled provider is not scheduled again', async () => {
    let connectCalls = 0
    const manager = createMcpLifecycleManager({
      providerId: 'mcp.disabled',
      sessionId: 'sess_004',
      traceId: 'trace_004',
      connect: async () => {
        connectCalls += 1
      },
    })

    manager.disable({
      reasonCode: 'manual_disable',
      userMessage: 'Disabled by operator.',
      retryable: false,
    })

    const finalSnapshot = await manager.connect()

    expect(finalSnapshot.state).toBe('disabled')
    expect(finalSnapshot.lastReason?.reasonCode).toBe('manual_disable')
    expect(connectCalls).toBe(0)
    expect(manager.canSchedule()).toBe(false)
  })
})
