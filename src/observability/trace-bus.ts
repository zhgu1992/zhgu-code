import { sanitizePayload } from './sanitize.js'
import type { TraceEnvelope, TraceEvent, TraceSink } from './trace-model.js'

const TRACE_QUEUE_MAX = Number.parseInt(
  process.env.ZHGU_TRACE_QUEUE_MAX || '2000',
  10,
)

class TraceBus {
  private sinks: TraceSink[] = []
  private queue: TraceEvent[] = []
  private draining = false
  private droppedEvents = 0

  addSink(sink: TraceSink): void {
    this.sinks.push(sink)
  }

  clearSinks(): void {
    this.sinks = []
  }

  emit(envelope: TraceEnvelope): void {
    const event: TraceEvent = {
      ts: new Date().toISOString(),
      ...envelope,
      payload: sanitizePayload(envelope.payload),
    }

    // Bounded queue: protect main flow under bursts.
    // Policy: drop low priority first; otherwise evict oldest.
    if (this.queue.length >= TRACE_QUEUE_MAX) {
      const dropCurrent = envelope.priority === 'low'
      if (dropCurrent) {
        this.droppedEvents += 1
        return
      }

      const lowIndex = this.queue.findIndex((item) => item.priority === 'low')
      if (lowIndex >= 0) {
        this.queue.splice(lowIndex, 1)
      } else {
        this.queue.shift()
      }
      this.droppedEvents += 1
    }

    if (this.droppedEvents > 0) {
      event.metrics = {
        ...event.metrics,
        dropped_events: this.droppedEvents,
      }
    }

    this.queue.push(event)
    if (!this.draining) {
      this.draining = true
      // Drain asynchronously so emit() stays non-blocking.
      queueMicrotask(() => {
        void this.drain()
      })
    }
  }

  private async drain(): Promise<void> {
    while (this.queue.length > 0) {
      const event = this.queue.shift()
      if (!event) {
        continue
      }

      const sinkTasks = this.sinks.map((sink) => Promise.resolve(sink.write(event)))
      try {
        await Promise.all(sinkTasks)
      } catch {
        // Never let observability failures break user-visible execution.
      }
    }
    this.draining = false
  }
}

let traceBus: TraceBus | null = null

export function getTraceBus(): TraceBus {
  if (traceBus) {
    return traceBus
  }

  traceBus = new TraceBus()
  return traceBus
}
