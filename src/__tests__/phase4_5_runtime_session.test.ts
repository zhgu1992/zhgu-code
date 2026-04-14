import { describe, expect, test } from 'bun:test'
import {
  createRuntimeSessionSnapshot,
  patchActivePlanContext,
  upsertActivePlanTask,
  writeActivePlanContext,
} from '../application/orchestrator/runtime-session.js'
import { createStore } from '../state/store.js'

describe('Phase 4.5 / P45-S01 Runtime session skeleton', () => {
  test('P45-S01-001 runtime session should start without active plan context', () => {
    const session = createRuntimeSessionSnapshot({
      sessionId: 'session_1',
      now: '2026-04-14T00:00:00.000Z',
    })

    expect(session.activePlan).toBeNull()
    expect(session.sessionId).toBe('session_1')
  })

  test('P45-S01-002 active plan context should support draft -> awaiting-approval -> running snapshots', () => {
    const base = createRuntimeSessionSnapshot({
      sessionId: 'session_2',
      now: '2026-04-14T00:00:00.000Z',
    })

    const draft = writeActivePlanContext(base, {
      planId: 'plan_2',
      planMode: 'plan',
      state: 'draft',
      planApprovalStatus: 'pending',
      now: '2026-04-14T00:00:01.000Z',
    })
    expect(draft.activePlan?.state).toBe('draft')
    expect(draft.activePlan?.planApprovalStatus).toBe('pending')

    const awaitingApproval = patchActivePlanContext(draft, {
      state: 'awaiting-approval',
      now: '2026-04-14T00:00:02.000Z',
    })
    expect(awaitingApproval.activePlan?.state).toBe('awaiting-approval')

    const running = patchActivePlanContext(awaitingApproval, {
      state: 'running',
      planApprovalStatus: 'approved',
      now: '2026-04-14T00:00:03.000Z',
    })
    expect(running.activePlan?.state).toBe('running')
    expect(running.activePlan?.planApprovalStatus).toBe('approved')
  })

  test('P45-S01-003 single session should only keep one active plan context', () => {
    const base = createRuntimeSessionSnapshot({
      sessionId: 'session_3',
      now: '2026-04-14T00:00:00.000Z',
    })

    const first = writeActivePlanContext(base, {
      planId: 'plan_3_a',
      planMode: 'plan',
      now: '2026-04-14T00:00:01.000Z',
    })
    const second = writeActivePlanContext(first, {
      planId: 'plan_3_b',
      planMode: 'plan',
      now: '2026-04-14T00:00:02.000Z',
    })

    expect(second.activePlan?.planId).toBe('plan_3_b')
    expect(Object.keys(second.activePlan?.taskIndex ?? {})).toHaveLength(0)
  })

  test('P45-S01-004 active plan task index should be upserted and readable', () => {
    const base = writeActivePlanContext(
      createRuntimeSessionSnapshot({
        sessionId: 'session_4',
        now: '2026-04-14T00:00:00.000Z',
      }),
      {
        planId: 'plan_4',
        planMode: 'plan',
        now: '2026-04-14T00:00:01.000Z',
      },
    )
    const next = upsertActivePlanTask(base, {
      taskId: 'task_4_1',
      title: 'collect evidence',
      status: 'running',
      taskEventSeq: 2,
      updatedAt: '2026-04-14T00:00:02.000Z',
    })

    expect(next.activePlan?.taskIndex.task_4_1.status).toBe('running')
    expect(next.activePlan?.taskIndex.task_4_1.taskEventSeq).toBe(2)
    expect(next.activePlan?.taskIndex.task_4_1.terminalReason).toBeNull()
  })

  test('P45-S01-006 active plan task index should keep terminal reason for failed task', () => {
    const base = writeActivePlanContext(
      createRuntimeSessionSnapshot({
        sessionId: 'session_5',
        now: '2026-04-14T00:00:00.000Z',
      }),
      {
        planId: 'plan_5',
        planMode: 'plan',
        now: '2026-04-14T00:00:01.000Z',
      },
    )
    const next = upsertActivePlanTask(base, {
      taskId: 'task_5_1',
      title: 'run guarded tool',
      status: 'failed',
      taskEventSeq: 2,
      terminalReason: 'permission_denied',
      updatedAt: '2026-04-14T00:00:02.000Z',
    })

    expect(next.activePlan?.taskIndex.task_5_1.status).toBe('failed')
    expect(next.activePlan?.taskIndex.task_5_1.terminalReason).toBe('permission_denied')
  })

  test('P45-S01-005 store should expose unified active plan read/write entry', () => {
    const store = createStore({
      model: 'test-model',
      permissionMode: 'ask',
      quiet: true,
      cwd: process.cwd(),
    })

    store.getState().setActivePlanContext({
      planId: 'plan_store_1',
      planMode: 'plan',
      state: 'draft',
    })
    store.getState().patchActivePlanContext({
      state: 'awaiting-approval',
    })
    store.getState().upsertActivePlanTask({
      taskId: 'task_store_1',
      title: 'draft runtime',
      status: 'pending',
      taskEventSeq: 0,
    })

    const activePlan = store.getState().orchestratorRuntimeSession.activePlan
    expect(activePlan?.planId).toBe('plan_store_1')
    expect(activePlan?.state).toBe('awaiting-approval')
    expect(activePlan?.taskIndex.task_store_1.status).toBe('pending')
  })
})
