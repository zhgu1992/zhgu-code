export type AggregationStrategy = 'first_success' | 'all_required'

export type AggregationTaskStatus = 'success' | 'failed'

export interface AggregationTaskResult {
  taskId: string
  submitSeq: number
  status: AggregationTaskStatus
  result?: unknown
  error?: string
}

export interface AggregationConflict {
  fingerprint: string
  taskIds: string[]
}

export interface AggregationResolution {
  strategy: AggregationStrategy
  winnerTaskId: string | null
  reason: string
}

export interface AggregationOutcome {
  status: 'success' | 'failed'
  result: unknown
  failedTaskIds: string[]
  conflicts: AggregationConflict[]
  resolution: AggregationResolution
}

export interface AggregateInput {
  strategy: AggregationStrategy
  tasks: AggregationTaskResult[]
}

export function sortTasksDeterministically(
  tasks: readonly AggregationTaskResult[],
): AggregationTaskResult[] {
  return [...tasks].sort((a, b) => {
    if (a.taskId === b.taskId) {
      return a.submitSeq - b.submitSeq
    }
    return a.taskId.localeCompare(b.taskId)
  })
}

function stableFingerprint(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableFingerprint(item)).join(',')}]`
  }

  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  const pairs = keys.map((key) => `${JSON.stringify(key)}:${stableFingerprint(record[key])}`)
  return `{${pairs.join(',')}}`
}

export function detectConflicts(
  successful: readonly AggregationTaskResult[],
): AggregationConflict[] {
  const byFingerprint = new Map<string, string[]>()
  for (const task of successful) {
    const fingerprint = stableFingerprint(task.result ?? null)
    const taskIds = byFingerprint.get(fingerprint) ?? []
    taskIds.push(task.taskId)
    byFingerprint.set(fingerprint, taskIds)
  }

  if (byFingerprint.size <= 1) {
    return []
  }

  return [...byFingerprint.entries()]
    .map(([fingerprint, taskIds]) => ({
      fingerprint,
      taskIds: [...taskIds].sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => a.fingerprint.localeCompare(b.fingerprint))
}

export function aggregateByFirstSuccess(
  tasks: readonly AggregationTaskResult[],
): AggregationOutcome {
  const ordered = sortTasksDeterministically(tasks)
  const successful = ordered.filter((task) => task.status === 'success')
  const failedTaskIds = ordered.filter((task) => task.status === 'failed').map((task) => task.taskId)
  const conflicts = detectConflicts(successful)

  if (successful.length === 0) {
    return {
      status: 'failed',
      result: {
        reason: 'all_tasks_failed',
        failedCount: failedTaskIds.length,
      },
      failedTaskIds,
      conflicts: [],
      resolution: {
        strategy: 'first_success',
        winnerTaskId: null,
        reason: 'all_tasks_failed',
      },
    }
  }

  const winner = successful[0]
  return {
    status: 'success',
    result: winner.result ?? null,
    failedTaskIds,
    conflicts,
    resolution: {
      strategy: 'first_success',
      winnerTaskId: winner.taskId,
      reason:
        conflicts.length > 0
          ? 'selected_by_task_id_then_submit_seq_with_conflicts'
          : 'selected_by_task_id_then_submit_seq',
    },
  }
}

export function aggregateByAllRequired(
  tasks: readonly AggregationTaskResult[],
): AggregationOutcome {
  const ordered = sortTasksDeterministically(tasks)
  const successful = ordered.filter((task) => task.status === 'success')
  const failed = ordered.filter((task) => task.status === 'failed')
  const failedTaskIds = failed.map((task) => task.taskId)
  const conflicts = detectConflicts(successful)

  const resultByTaskId: Record<string, unknown> = {}
  for (const task of successful) {
    resultByTaskId[task.taskId] = task.result ?? null
  }

  if (failed.length > 0) {
    return {
      status: 'failed',
      result: {
        reason: 'required_task_failed',
        partialResults: resultByTaskId,
      },
      failedTaskIds,
      conflicts,
      resolution: {
        strategy: 'all_required',
        winnerTaskId: null,
        reason: 'required_task_failed',
      },
    }
  }

  return {
    status: 'success',
    result: resultByTaskId,
    failedTaskIds: [],
    conflicts,
    resolution: {
      strategy: 'all_required',
      winnerTaskId: null,
      reason: conflicts.length > 0 ? 'all_required_success_with_conflicts' : 'all_required_success',
    },
  }
}
