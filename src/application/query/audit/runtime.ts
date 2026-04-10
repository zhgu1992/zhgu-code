import { resolve } from 'node:path'
import { createSpanId } from '../../../observability/ids.js'
import { getTraceBus } from '../../../observability/trace-bus.js'
import type { AuditEvent } from './model.js'
import { JsonlAuditWriter } from './writer.js'

let auditWriter: JsonlAuditWriter | null = null
let auditWriterPath: string | null = null

export function getAuditWriter(): JsonlAuditWriter {
  const outputPath = resolve(
    process.cwd(),
    process.env.ZHGU_AUDIT_FILE || '.trace/audit.jsonl',
  )
  if (auditWriter && auditWriterPath === outputPath) {
    return auditWriter
  }

  auditWriter = new JsonlAuditWriter({
    outputPath,
    onError: (error, context) => {
      const message = error instanceof Error ? error.message : String(error)
      const traceBus = getTraceBus()
      traceBus.emit({
        stage: 'tool',
        event: 'audit_write_failed',
        status: 'error',
        session_id: context.event.session_id,
        trace_id: context.event.trace_id,
        turn_id: context.event.turn_id,
        span_id: createSpanId(),
        payload: {
          requestId: context.event.request_id,
          toolName: context.event.tool_name,
          auditEventType: context.event.type,
          outputPath: context.outputPath,
          message,
        },
      })
    },
  })
  auditWriterPath = outputPath
  return auditWriter
}

export function recordAuditEvent(event: AuditEvent): void {
  getAuditWriter().record(event)
}

export async function flushAuditWriter(): Promise<void> {
  if (!auditWriter) {
    return
  }
  await auditWriter.flush()
}

export function resetAuditWriterForTests(): void {
  auditWriter = null
  auditWriterPath = null
}
