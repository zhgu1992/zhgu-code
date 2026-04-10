import { appendFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { AuditEvent } from './model.js'

export interface AuditWriteErrorContext {
  outputPath: string
  event: AuditEvent
}

interface JsonlAuditWriterOptions {
  outputPath: string
  onError?: (error: unknown, context: AuditWriteErrorContext) => void
}

export class JsonlAuditWriter {
  private readonly outputPath: string
  private readonly onError: (error: unknown, context: AuditWriteErrorContext) => void
  private writeChain = Promise.resolve()
  private pendingWrites = 0
  private idleWaiters: Array<() => void> = []

  constructor(options: JsonlAuditWriterOptions) {
    this.outputPath = options.outputPath
    this.onError = options.onError ?? defaultErrorHandler
  }

  record(event: AuditEvent): void {
    this.pendingWrites += 1
    this.writeChain = this.writeChain
      .then(async () => this.writeEvent(event))
      .catch((error) => {
        this.onError(error, {
          outputPath: this.outputPath,
          event,
        })
      })
      .finally(() => {
        this.pendingWrites -= 1
        this.notifyIdle()
      })
  }

  async flush(): Promise<void> {
    if (this.pendingWrites === 0) {
      return
    }
    await new Promise<void>((resolve) => {
      this.idleWaiters.push(resolve)
    })
  }

  private async writeEvent(event: AuditEvent): Promise<void> {
    await mkdir(dirname(this.outputPath), { recursive: true })
    await appendFile(this.outputPath, `${JSON.stringify(event)}\n`, 'utf8')
  }

  private notifyIdle(): void {
    if (this.pendingWrites > 0) {
      return
    }
    const waiters = this.idleWaiters
    this.idleWaiters = []
    for (const waiter of waiters) {
      waiter()
    }
  }
}

function defaultErrorHandler(error: unknown, context: AuditWriteErrorContext): void {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(
    `[audit] write failed path=${context.outputPath} type=${context.event.type} request=${context.event.request_id} error=${message}\n`,
  )
}
