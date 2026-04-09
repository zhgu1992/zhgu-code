import { appendFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { TraceEvent, TraceSink } from './trace-model.js'

export class JsonlTraceSink implements TraceSink {
  constructor(private readonly outputPath: string) {}

  async write(event: TraceEvent): Promise<void> {
    await mkdir(dirname(this.outputPath), { recursive: true })
    await appendFile(this.outputPath, `${JSON.stringify(event)}\n`, 'utf8')
  }
}

export class ConsoleTraceSink implements TraceSink {
  constructor(private readonly enabled: boolean) {}

  write(event: TraceEvent): void {
    if (!this.enabled) {
      return
    }

    if (!shouldPrint(event)) {
      return
    }

    const turnId = event.turn_id ? ` turn=${shorten(event.turn_id)}` : ''
    const spanId = ` span=${shorten(event.span_id)}`
    const line = `[trace] ${event.stage}.${event.event} status=${event.status}${turnId}${spanId}`
    process.stderr.write(`${line}\n`)
  }
}

function shouldPrint(event: TraceEvent): boolean {
  const key = `${event.stage}.${event.event}`
  const allowed = new Set([
    'session.start',
    'ui.repl_start',
    'turn.start',
    'turn.end',
    'turn.error',
    'provider.stream_start',
    'provider.first_event',
    'provider.connect_timeout',
    'provider.stream_end',
    'provider.stream_error',
    'tool.call_start',
    'tool.call_end',
    'tool.call_error',
    'permission.prompt',
    'permission.allow',
    'permission.deny',
  ])

  return allowed.has(key)
}

function shorten(id: string): string {
  return id.slice(-8)
}
