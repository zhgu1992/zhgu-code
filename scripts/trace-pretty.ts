#!/usr/bin/env bun
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

type TraceEvent = {
  ts?: string
  stage?: string
  event?: string
  status?: string
  turn_id?: string
  span_id?: string
  metrics?: {
    duration_ms?: number
  }
  payload?: Record<string, unknown>
}

const args = process.argv.slice(2)
const follow = args.includes('--follow') || args.includes('-f')
const useUtc = args.includes('--utc')
const verbose = args.includes('--verbose')
const stageFilterArg = getFlagValue(args, '--stage')
const stages = new Set(
  (stageFilterArg || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean),
)

const positional = args.filter((arg) => !arg.startsWith('-'))
const tracePath = resolve(process.cwd(), positional[0] || '.trace/trace.jsonl')
let lastTurnPrinted: string | null = null

process.stdout.on('error', (error) => {
  if ((error as NodeJS.ErrnoException).code === 'EPIPE') {
    process.exit(0)
  }
})

async function main(): Promise<void> {
  const initial = await safeRead(tracePath)
  printChunk(initial)

  if (!follow) {
    return
  }

  let previous = initial
  process.stderr.write(`[trace:pretty] following ${tracePath}\n`)
  while (true) {
    await sleep(500)
    const next = await safeRead(tracePath)
    if (next === previous) {
      continue
    }

    if (next.length < previous.length) {
      process.stderr.write('[trace:pretty] file rotated/truncated, restarting stream\n')
      printChunk(next)
    } else {
      printChunk(next.slice(previous.length))
    }

    previous = next
  }
}

function printChunk(chunk: string): void {
  const lines = chunk
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  for (const line of lines) {
    try {
      const event = JSON.parse(line) as TraceEvent
      if (stages.size > 0 && event.stage && !stages.has(event.stage)) {
        continue
      }
      if (!verbose && isNoiseEvent(event)) {
        continue
      }
      if (event.turn_id && event.turn_id !== lastTurnPrinted && event.event === 'start' && event.stage === 'turn') {
        process.stdout.write(`\n=== TURN ${shorten(event.turn_id)} ===\n`)
        lastTurnPrinted = event.turn_id
      }
      process.stdout.write(`${formatEvent(event)}\n`)
    } catch {
      process.stdout.write(`[trace:pretty] invalid jsonl line: ${line.slice(0, 120)}\n`)
    }
  }
}

function formatEvent(event: TraceEvent): string {
  const ts = formatTime(event.ts)
  const marker = statusMarker(event.status)
  const stageEvent = `${event.stage || 'unknown'}.${event.event || 'unknown'}`
  const status = event.status || 'unknown'
  const turn = event.turn_id ? ` turn=${shorten(event.turn_id)}` : ''
  const span = event.span_id ? ` span=${shorten(event.span_id)}` : ''
  const summary = summarizeEvent(event)
  return `[${ts}] ${marker} ${stageEvent} ${status}${turn}${span}${summary ? ` | ${summary}` : ''}`
}

function summarizeEvent(event: TraceEvent): string {
  const parts: string[] = []
  if (typeof event.metrics?.duration_ms === 'number') {
    parts.push(`dur=${event.metrics.duration_ms}ms`)
  }

  const payload = event.payload
  if (!payload) {
    return parts.join(' ')
  }

  const toolName = payload.toolName || payload.name
  if (typeof toolName === 'string') {
    parts.push(`tool=${toolName}`)
  }

  const mode = payload.mode
  if (typeof mode === 'string') {
    parts.push(`mode=${mode}`)
  }

  const error = payload.error || payload.message
  if (typeof error === 'string') {
    parts.push(`msg=${truncate(error, 80)}`)
  }

  return parts.join(' ')
}

function formatTime(ts?: string): string {
  if (!ts) {
    return '--:--:--.---'
  }
  const date = new Date(ts)
  if (Number.isNaN(date.getTime())) {
    return '--:--:--.---'
  }
  if (useUtc) {
    return date.toISOString().slice(11, 23)
  }
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}.${pad3(date.getMilliseconds())}`
}

function statusMarker(status?: string): string {
  switch (status) {
    case 'start':
      return '▶'
    case 'ok':
      return '✓'
    case 'error':
      return '✗'
    case 'timeout':
      return '⏱'
    default:
      return '•'
  }
}

function shorten(id: string): string {
  return id.slice(-8)
}

function truncate(input: string, maxLen: number): string {
  if (input.length <= maxLen) {
    return input
  }
  return `${input.slice(0, maxLen)}...`
}

async function safeRead(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return ''
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getFlagValue(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag)
  if (index >= 0 && argv[index + 1]) {
    return argv[index + 1]
  }
  return undefined
}

function isNoiseEvent(event: TraceEvent): boolean {
  if (event.stage !== 'state') {
    return false
  }

  if (event.event === 'tool_progress') {
    return true
  }

  if (event.event === 'error' && event.status === 'ok') {
    return true
  }

  return false
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0')
}

function pad3(n: number): string {
  return n.toString().padStart(3, '0')
}

void main()
