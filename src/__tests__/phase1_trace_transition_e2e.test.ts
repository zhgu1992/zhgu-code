import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import type { QueryTurnEvent } from '../architecture/contracts/query-engine.js'
import { createTurnStateMachine, type ToolExecutionMode } from '../application/query/turn-state.js'
import { createSpanId } from '../observability/ids.js'
import { validateTraceFile } from '../observability/replay.js'
import { JsonlTraceSink } from '../observability/sinks.js'
import { getTraceBus } from '../observability/trace-bus.js'
import { createStore } from '../state/store.js'

interface ScenarioTransition {
  type: QueryTurnEvent
  toolMode?: ToolExecutionMode
}

interface ScenarioInput {
  transitions: ScenarioTransition[]
  turnEvent: 'end' | 'error'
}

const originalTranscriptPath = process.env.ZHGU_TRANSCRIPT_FILE

async function createTempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix))
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForEventCount(filePath: string, expected: number): Promise<void> {
  const deadline = Date.now() + 2000
  while (Date.now() < deadline) {
    try {
      const content = await readFile(filePath, 'utf8')
      const lines = content
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
      if (lines.length >= expected) {
        return
      }
    } catch {
      // File may not exist yet while queue is still draining.
    }
    await sleep(10)
  }
  throw new Error(`Timeout waiting for trace events file=${filePath} expected>=${expected}`)
}

async function runScenario(tracePath: string, scenario: ScenarioInput): Promise<void> {
  const bus = getTraceBus()
  const store = createStore({
    model: 'claude-sonnet-4-6',
    permissionMode: 'auto',
    quiet: true,
    cwd: process.cwd(),
  })
  const state = store.getState()
  const turnId = `turn_e2e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const turnSpanId = createSpanId()

  const machine = createTurnStateMachine({
    onTransition: (transition) => state.applyTurnTransition(transition),
  })

  bus.emit({
    stage: 'turn',
    event: 'start',
    status: 'start',
    session_id: state.sessionId,
    trace_id: state.traceId,
    turn_id: turnId,
    span_id: turnSpanId,
  })

  machine.transition({ type: 'turn_start', turnId })
  for (const transition of scenario.transitions) {
    machine.transition(transition)
  }

  bus.emit({
    stage: 'turn',
    event: scenario.turnEvent,
    status: scenario.turnEvent === 'end' ? 'ok' : 'error',
    session_id: state.sessionId,
    trace_id: state.traceId,
    turn_id: turnId,
    span_id: turnSpanId,
  })

  await waitForEventCount(tracePath, scenario.transitions.length + 3)
}

describe('Phase 1 / WP1-F Trace transition e2e replay assertions', () => {
  beforeEach(() => {
    const bus = getTraceBus()
    bus.clearSinks()
  })

  afterEach(() => {
    const bus = getTraceBus()
    bus.clearSinks()
    process.env.ZHGU_TRANSCRIPT_FILE = originalTranscriptPath
  })

  test('FTR-E2E-001 normal completion chain passes via file replay', async () => {
    const dir = await createTempDir('wp1f-trace-e2e-normal-')
    const tracePath = join(dir, 'trace.jsonl')
    const transcriptPath = join(dir, 'transcript.jsonl')
    process.env.ZHGU_TRANSCRIPT_FILE = transcriptPath

    getTraceBus().addSink(new JsonlTraceSink(tracePath))

    await runScenario(tracePath, {
      transitions: [{ type: 'assistant_done' }],
      turnEvent: 'end',
    })

    const report = await validateTraceFile(tracePath)
    expect(report.pass).toBe(true)
    expect(report.failures).toEqual([])
  })

  test('FTR-E2E-002 tool continuation chain passes via file replay', async () => {
    const dir = await createTempDir('wp1f-trace-e2e-tool-')
    const tracePath = join(dir, 'trace.jsonl')
    const transcriptPath = join(dir, 'transcript.jsonl')
    process.env.ZHGU_TRANSCRIPT_FILE = transcriptPath

    getTraceBus().addSink(new JsonlTraceSink(tracePath))

    await runScenario(tracePath, {
      transitions: [
        { type: 'tool_use_detected', toolMode: 'auto' },
        { type: 'tool_result_written' },
        { type: 'assistant_done' },
      ],
      turnEvent: 'end',
    })

    const report = await validateTraceFile(tracePath)
    expect(report.pass).toBe(true)
    expect(report.failures).toEqual([])
  })

  test('FTR-E2E-003 error termination chain passes via file replay', async () => {
    const dir = await createTempDir('wp1f-trace-e2e-error-')
    const tracePath = join(dir, 'trace.jsonl')
    const transcriptPath = join(dir, 'transcript.jsonl')
    process.env.ZHGU_TRANSCRIPT_FILE = transcriptPath

    getTraceBus().addSink(new JsonlTraceSink(tracePath))

    await runScenario(tracePath, {
      transitions: [
        { type: 'recoverable_error' },
        { type: 'recovery_failed' },
      ],
      turnEvent: 'error',
    })

    const report = await validateTraceFile(tracePath)
    expect(report.pass).toBe(true)
    expect(report.failures).toEqual([])
  })
})
