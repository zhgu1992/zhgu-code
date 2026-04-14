import { describe, expect, test } from 'bun:test'
import { aggregateTaskResults, type AggregateInput } from '../application/orchestrator/index.js'

describe('Phase 4 / WP4-C Agent aggregation protocol', () => {
  test('AGG-001 first_success should return deterministic winner in multi-success case', () => {
    const input: AggregateInput = {
      strategy: 'first_success',
      tasks: [
        { taskId: 'task_b', submitSeq: 2, status: 'success', result: { value: 2 } },
        { taskId: 'task_a', submitSeq: 3, status: 'success', result: { value: 1 } },
        { taskId: 'task_c', submitSeq: 1, status: 'failed', error: 'boom' },
      ],
    }

    const output = aggregateTaskResults(input)
    expect(output.status).toBe('success')
    expect(output.result).toEqual({ value: 1 })
    expect(output.resolution.winnerTaskId).toBe('task_a')
    expect(output.failedTaskIds).toEqual(['task_c'])
  })

  test('AGG-002 first_success should return structured failure when all failed', () => {
    const output = aggregateTaskResults({
      strategy: 'first_success',
      tasks: [
        { taskId: 'task_a', submitSeq: 1, status: 'failed', error: 'timeout' },
        { taskId: 'task_b', submitSeq: 2, status: 'failed', error: 'runtime' },
      ],
    })

    expect(output.status).toBe('failed')
    expect(output.result).toEqual({
      reason: 'all_tasks_failed',
      failedCount: 2,
    })
    expect(output.resolution.reason).toBe('all_tasks_failed')
    expect(output.failedTaskIds).toEqual(['task_a', 'task_b'])
  })

  test('AGG-003 all_required should aggregate success when all tasks succeed', () => {
    const output = aggregateTaskResults({
      strategy: 'all_required',
      tasks: [
        { taskId: 'task_b', submitSeq: 2, status: 'success', result: { score: 9 } },
        { taskId: 'task_a', submitSeq: 1, status: 'success', result: { score: 8 } },
      ],
    })

    expect(output.status).toBe('success')
    expect(output.result).toEqual({
      task_a: { score: 8 },
      task_b: { score: 9 },
    })
    expect(output.failedTaskIds).toEqual([])
  })

  test('AGG-004 all_required should fail and keep partial snapshot when any task fails', () => {
    const output = aggregateTaskResults({
      strategy: 'all_required',
      tasks: [
        { taskId: 'task_a', submitSeq: 1, status: 'success', result: { summary: 'ok' } },
        { taskId: 'task_c', submitSeq: 3, status: 'failed', error: 'permission_denied' },
        { taskId: 'task_b', submitSeq: 2, status: 'success', result: { summary: 'ok-2' } },
      ],
    })

    expect(output.status).toBe('failed')
    expect(output.failedTaskIds).toEqual(['task_c'])
    expect(output.result).toEqual({
      reason: 'required_task_failed',
      partialResults: {
        task_a: { summary: 'ok' },
        task_b: { summary: 'ok-2' },
      },
    })
  })

  test('AGG-005 repeated runs with same input should produce identical output', () => {
    const input: AggregateInput = {
      strategy: 'all_required',
      tasks: [
        { taskId: 'task_2', submitSeq: 2, status: 'success', result: { content: 'B' } },
        { taskId: 'task_1', submitSeq: 1, status: 'success', result: { content: 'A' } },
      ],
    }
    const first = aggregateTaskResults(input)
    const second = aggregateTaskResults(input)

    expect(second).toEqual(first)
  })

  test('AGG-006 conflict should include conflict groups and resolution strategy', () => {
    const output = aggregateTaskResults({
      strategy: 'first_success',
      tasks: [
        { taskId: 'task_b', submitSeq: 2, status: 'success', result: { value: 'X' } },
        { taskId: 'task_a', submitSeq: 1, status: 'success', result: { value: 'Y' } },
      ],
    })

    expect(output.conflicts).toHaveLength(2)
    expect(output.resolution.strategy).toBe('first_success')
    expect(output.resolution.reason).toContain('conflicts')
  })
})
