import { appendFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { MessageContent, Message } from '../../../definitions/types/index.js'
import {
  createMessageAppendEvent,
  createSessionEndEvent,
  createSessionStartEvent,
  type TranscriptEvent,
} from './model.js'

interface TranscriptBaseInput {
  sessionId: string
  traceId: string
  turnId?: string
}

export interface TranscriptSessionStartInput extends TranscriptBaseInput {
  model: string
  cwd: string
}

export interface TranscriptMessageAppendInput extends TranscriptBaseInput {
  messageId: string
  role: Message['role']
  content: MessageContent
  isToolResult?: boolean
}

export interface TranscriptSessionEndInput extends TranscriptBaseInput {
  reason?: string
  durationMs?: number
}

export interface TranscriptWriteErrorContext {
  outputPath: string
  event: TranscriptEvent
}

interface JsonlTranscriptWriterOptions {
  outputPath: string
  onError?: (error: unknown, context: TranscriptWriteErrorContext) => void
}

export class JsonlTranscriptWriter {
  private readonly outputPath: string
  private readonly onError: (error: unknown, context: TranscriptWriteErrorContext) => void
  private writeChain = Promise.resolve()
  private pendingWrites = 0
  private idleWaiters: Array<() => void> = []
  private sessionEnded = false

  constructor(options: JsonlTranscriptWriterOptions) {
    this.outputPath = options.outputPath
    this.onError = options.onError ?? defaultErrorHandler
  }

  recordSessionStart(input: TranscriptSessionStartInput): void {
    this.enqueue(
      createSessionStartEvent({
        sessionId: input.sessionId,
        traceId: input.traceId,
        turnId: input.turnId,
        model: input.model,
        cwd: input.cwd,
      }),
    )
  }

  recordMessageAppend(input: TranscriptMessageAppendInput): void {
    this.enqueue(
      createMessageAppendEvent({
        sessionId: input.sessionId,
        traceId: input.traceId,
        turnId: input.turnId,
        messageId: input.messageId,
        role: input.role,
        content: input.content,
        isToolResult: input.isToolResult,
      }),
    )
  }

  recordSessionEnd(input: TranscriptSessionEndInput): void {
    if (this.sessionEnded) {
      return
    }
    this.sessionEnded = true
    this.enqueue(
      createSessionEndEvent({
        sessionId: input.sessionId,
        traceId: input.traceId,
        turnId: input.turnId,
        reason: input.reason,
        durationMs: input.durationMs,
      }),
    )
  }

  async flush(): Promise<void> {
    if (this.pendingWrites === 0) {
      return
    }

    await new Promise<void>((resolve) => {
      this.idleWaiters.push(resolve)
    })
  }

  private enqueue(event: TranscriptEvent): void {
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

  private async writeEvent(event: TranscriptEvent): Promise<void> {
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

function defaultErrorHandler(error: unknown, context: TranscriptWriteErrorContext): void {
  const errorMessage = error instanceof Error ? error.message : String(error)
  process.stderr.write(
    `[transcript] write failed path=${context.outputPath} type=${context.event.type} error=${errorMessage}\n`,
  )
}
