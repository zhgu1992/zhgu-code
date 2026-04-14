import { describe, expect, test } from 'bun:test'
import {
  createTaskLifecycleModel,
  IllegalTaskTransitionError,
} from '../application/orchestrator/index.js'

describe('Phase 4 / WP4-B Task lifecycle model', () => {
  test('TSK-001 create task should start at pending', () => {
    const model = createTaskLifecycleModel({ taskId: 'task_1', title: 'task one' })
    expect(model.getSnapshot().status).toBe('pending')
  })

  test('TSK-002 legal transition pending -> running should pass', () => {
    const model = createTaskLifecycleModel({ taskId: 'task_2', title: 'task two' })
    const next = model.transition('start')
    expect(next.status).toBe('running')
    expect(next.taskEventSeq).toBe(1)
  })

  test('TSK-003 running -> paused -> running should be resumable', () => {
    const model = createTaskLifecycleModel({ taskId: 'task_3', title: 'task three' })
    model.transition('start')
    expect(model.transition('pause').status).toBe('paused')
    expect(model.transition('resume').status).toBe('running')
  })

  test('TSK-004 running -> canceled(user_canceled) should persist reason', () => {
    const model = createTaskLifecycleModel({ taskId: 'task_4', title: 'task four' })
    model.transition('start')
    const next = model.transition('cancel', 'user_canceled')
    expect(next.status).toBe('canceled')
    expect(next.terminalReason).toBe('user_canceled')
  })

  test('TSK-005 running -> failed(runtime_error) should persist reason', () => {
    const model = createTaskLifecycleModel({ taskId: 'task_5', title: 'task five' })
    model.transition('start')
    const next = model.transition('fail', 'runtime_error')
    expect(next.status).toBe('failed')
    expect(next.terminalReason).toBe('runtime_error')
  })

  test('TSK-006 illegal transition completed -> running should be blocked', () => {
    const model = createTaskLifecycleModel({ taskId: 'task_6', title: 'task six' })
    model.transition('start')
    model.transition('complete')
    expect(() => model.transition('start')).toThrow(IllegalTaskTransitionError)
  })

  test('TSK-007 repeated terminal transition should be idempotent', () => {
    const model = createTaskLifecycleModel({ taskId: 'task_7', title: 'task seven' })
    model.transition('start')
    const first = model.transition('cancel', 'user_canceled')
    const second = model.transition('cancel', 'user_canceled')

    expect(first.status).toBe('canceled')
    expect(second.status).toBe('canceled')
    expect(second.taskEventSeq).toBe(first.taskEventSeq)
    expect(second.events).toHaveLength(first.events.length)
  })
})
