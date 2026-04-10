import { describe, expect, test } from 'bun:test'
import {
  buildPhase2RollbackBaseline,
  createAcceptanceReportTemplate,
  createPhaseSummaryTemplate,
  createRiskWaiverTemplate,
  evaluateHardGateMatrix,
  evaluatePhase2Closure,
  type Phase2DoDCheck,
  type Phase2GateResult,
  validatePhase2Summary,
} from '../application/phase2/closure.js'

function createGreenHardGateResults(): Phase2GateResult[] {
  return [
    { gate: 'build', command: 'bun run build', success: true },
    { gate: 'typecheck', command: 'bunx tsc --noEmit', success: true },
    { gate: 'lint', command: 'bun run lint', success: true },
    { gate: 'phase1', command: 'bun test src/__tests__/phase1_*.test.ts', success: true },
    { gate: 'phase2', command: 'bun test src/__tests__/phase2*.test.ts', success: true },
  ]
}

function createAllSatisfiedDoDChecks(): Phase2DoDCheck[] {
  return [
    { id: 'CLS-001', satisfied: true },
    { id: 'CLS-002', satisfied: true },
    { id: 'CLS-003', satisfied: true },
    { id: 'CLS-004', satisfied: true },
    { id: 'CLS-005', satisfied: true },
    { id: 'CLS-006', satisfied: true },
  ]
}

describe('Phase 2 Closure (wip2-07 / WP2-F)', () => {
  test('CLS-001 acceptance report template has required minimal fields', () => {
    const template = createAcceptanceReportTemplate({
      commit: 'abc123',
      date: '2026-04-10',
      owner: 'wp2f-owner',
    })

    expect(template.commit).toBe('abc123')
    expect(template.date).toBe('2026-04-10')
    expect(template.owner).toBe('wp2f-owner')
    expect(template.commands.length).toBeGreaterThan(0)
    expect(template.results).toHaveProperty('passed')
    expect(template.results).toHaveProperty('failed')
    expect(template).toHaveProperty('decision')
  })

  test('CLS-002 hard gate matrix covers build/type/lint + phase1_* + phase2_*', () => {
    const matrixStatus = evaluateHardGateMatrix(createGreenHardGateResults())
    expect(matrixStatus.missingGates).toEqual([])
    expect(matrixStatus.failedGates).toEqual([])
  })

  test('CLS-003 hard gate failure leads to FAIL with rollback actions', () => {
    const failed = createGreenHardGateResults().map((item) =>
      item.gate === 'lint' ? { ...item, success: false } : item,
    )
    const result = evaluatePhase2Closure({
      gateResults: failed,
      dodChecks: createAllSatisfiedDoDChecks(),
      reviewOwner: 'owner-a',
      nextReviewAt: '2026-04-12',
      evaluatedAt: '2026-04-10T00:00:00.000Z',
    })

    expect(result.decision).toBe('FAIL')
    expect(result.phase34Blocked).toBe(true)
    expect(result.failedGates).toEqual(['lint'])
    expect(result.rollbackActions).toEqual(buildPhase2RollbackBaseline())
  })

  test('CLS-004 valid low/medium waiver yields PASS_WITH_WAIVER', () => {
    const waiver = createRiskWaiverTemplate({
      waiverId: 'WVR-001',
      risk: 'medium',
      impactScope: 'phase2 boundary hardening false-positive in one scenario',
      mitigation: 'manual approval + trace monitoring',
      expiresOn: '2026-04-20T00:00:00.000Z',
      owner: 'owner-b',
      approver: 'approver-b',
      approved: true,
      status: 'open',
    })
    const result = evaluatePhase2Closure({
      gateResults: createGreenHardGateResults(),
      dodChecks: createAllSatisfiedDoDChecks(),
      waivers: [waiver],
      evaluatedAt: '2026-04-10T00:00:00.000Z',
    })

    expect(waiver.expiresOn).toContain('2026-04-20')
    expect(waiver.mitigation.length).toBeGreaterThan(0)
    expect(result.decision).toBe('PASS_WITH_WAIVER')
    expect(result.phase34Blocked).toBe(false)
    expect(result.invalidWaivers).toEqual([])
  })

  test('CLS-005 summary template exposes completed/uncompleted/blockers for roadmap writeback', () => {
    const summary = createPhaseSummaryTemplate({
      alignedItems: ['wip2-02~06 code landed'],
      unalignedItems: ['none'],
      residualRisks: ['one medium waiver open'],
      prePhase3Actions: ['close waiver before expiry'],
      phase3Blockers: ['none'],
    })
    const issues = validatePhase2Summary(summary)

    expect(summary.alignedItems.length).toBeGreaterThan(0)
    expect(summary.unalignedItems.length).toBeGreaterThan(0)
    expect(summary.phase3Blockers.length).toBeGreaterThan(0)
    expect(issues).toEqual([])
  })

  test('CLS-006 unmet DoD must block Phase 3/4 with retry owner and date', () => {
    const dodChecks = createAllSatisfiedDoDChecks().map((item) =>
      item.id === 'CLS-006' ? { ...item, satisfied: false } : item,
    )
    const result = evaluatePhase2Closure({
      gateResults: createGreenHardGateResults(),
      dodChecks,
      reviewOwner: 'owner-c',
      nextReviewAt: '2026-04-13',
      evaluatedAt: '2026-04-10T00:00:00.000Z',
    })

    expect(result.decision).toBe('FAIL')
    expect(result.phase34Blocked).toBe(true)
    expect(result.reason).toContain('Do not proceed to Phase 3/4')
    expect(result.retryOwner).toBe('owner-c')
    expect(result.nextReviewAt).toBe('2026-04-13')
    expect(result.dodFailures).toEqual(['CLS-006'])
  })
})
