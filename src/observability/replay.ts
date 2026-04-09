import { readFile } from 'node:fs/promises'
import type { TraceEvent } from './trace-model.js'
import { validateTraceEvents, type TraceAssertionReport } from './assertions.js'

export async function loadTraceEvents(filePath: string): Promise<TraceEvent[]> {
  const content = await readFile(filePath, 'utf8')
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as TraceEvent)
}

export async function validateTraceFile(filePath: string): Promise<TraceAssertionReport> {
  const events = await loadTraceEvents(filePath)
  return validateTraceEvents(events)
}
