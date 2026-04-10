#!/usr/bin/env bun
import { resolve } from 'node:path'
import { validateTraceEvents } from '../src/observability/assertions.js'
import { loadTraceEvents } from '../src/observability/replay.js'

const argv = process.argv.slice(2)
const validateAll = argv.includes('--all')
const args = argv.filter((arg) => !arg.startsWith('-'))
const tracePath = resolve(process.cwd(), args[0] || '.trace/trace.jsonl')

async function main(): Promise<void> {
  try {
    const events = await loadTraceEvents(tracePath)
    if (events.length === 0) {
      process.stderr.write(`[trace:assert] ERROR ${tracePath} empty trace file\n`)
      process.exitCode = 2
      return
    }

    const targetEvents = validateAll ? events : filterLatestSession(events)
    const report = validateTraceEvents(targetEvents)

    if (report.pass) {
      const scope = validateAll ? 'all-events' : `latest-session(${targetEvents[0]?.session_id || 'unknown'})`
      process.stdout.write(`[trace:assert] PASS ${tracePath} scope=${scope}\n`)
      return
    }

    process.stderr.write(
      `[trace:assert] FAIL ${tracePath} (${report.failures.length} failure${report.failures.length === 1 ? '' : 's'})\n`,
    )
    for (const failure of report.failures) {
      process.stderr.write(`- ${failure}\n`)
    }
    process.exitCode = 1
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`[trace:assert] ERROR ${tracePath} ${message}\n`)
    process.exitCode = 2
  }
}

function filterLatestSession(events: Awaited<ReturnType<typeof loadTraceEvents>>) {
  const latest = events[events.length - 1]
  if (!latest?.session_id) {
    return events
  }
  return events.filter((event) => event.session_id === latest.session_id)
}

void main()
