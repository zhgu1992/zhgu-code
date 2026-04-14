import { describe, expect, test } from 'bun:test'
import {
  buildPhase4RollbackBaseline,
  createPhase4AcceptanceReportTemplate,
  evaluatePhase4Closure,
  evaluatePhase4HardGateMatrix,
  type Phase4DoDCheck,
  type Phase4GateResult,
  type Phase4RiskWaiver,
} from '../application/phase4/closure.js'

function createGreenHardGateResults(): Phase4GateResult[] {
  return [
    { gate: 'build', command: 'bun run build', success: true },
    { gate: 'typecheck', command: 'bunx tsc --noEmit', success: true },
    { gate: 'lint', command: 'bun run lint', success: true },
    { gate: 'phase1', command: 'bun test src/__tests__/phase1*.test.ts', success: true },
    { gate: 'phase2', command: 'bun test src/__tests__/phase2*.test.ts', success: true },
    { gate: 'phase3', command: 'bun test src/__tests__/phase3*.test.ts', success: true },
    { gate: 'phase4', command: 'bun test src/__tests__/phase4*.test.ts', success: true },
  ]
}

function createAllSatisfiedDoDChecks(): Phase4DoDCheck[] {
  return [
    { id: 'CLS4-001', satisfied: true },
    { id: 'CLS4-002', satisfied: true },
    { id: 'CLS4-003', satisfied: true },
    { id: 'CLS4-004', satisfied: true },
  ]
}

describe('Phase 4 Closure (wip4-06 / WP4-E)', () => {
  test('CLS4-001 missing/failed hard gate should fail closure', () => {
    const withFailure = createGreenHardGateResults().map((item) =>
      item.gate === 'phase4' ? { ...item, success: false } : item,
    )
    const matrix = evaluatePhase4HardGateMatrix(withFailure)
    const result = evaluatePhase4Closure({
      gateResults: withFailure,
      dodChecks: createAllSatisfiedDoDChecks(),
      reviewOwner: 'wp4e-owner',
      nextReviewAt: '2026-04-15',
    })

    expect(matrix.missingGates).toEqual([])
    expect(matrix.failedGates).toEqual(['phase4'])
    expect(result.decision).toBe('FAIL')
    expect(result.phase5Blocked).toBe(true)
    expect(result.reason).toContain('failed hard gates: phase4')
    expect(result.rollbackActions).toEqual(buildPhase4RollbackBaseline())
  })

  test('CLS4-002 DoD unmet should block Phase 5', () => {
    const dodChecks = createAllSatisfiedDoDChecks().map((item) =>
      item.id === 'CLS4-002' ? { ...item, satisfied: false } : item,
    )
    const result = evaluatePhase4Closure({
      gateResults: createGreenHardGateResults(),
      dodChecks,
      reviewOwner: 'wp4e-owner',
      nextReviewAt: '2026-04-16',
    })

    expect(result.decision).toBe('FAIL')
    expect(result.phase5Blocked).toBe(true)
    expect(result.dodFailures).toEqual(['CLS4-002'])
    expect(result.reason).toContain('Do not proceed to Phase 5')
  })

  test('CLS4-003 expired or unapproved waiver should fail closure', () => {
    const waiver: Phase4RiskWaiver = {
      waiverId: 'WVR4-001',
      risk: 'medium',
      impactScope: 'temporary instability in rollback automation',
      mitigation: 'manual execution with reviewer checklist',
      expiresOn: '2026-04-10T00:00:00.000Z',
      owner: 'ops-owner',
      approver: 'security-owner',
      approved: false,
      status: 'open',
    }
    const result = evaluatePhase4Closure({
      gateResults: createGreenHardGateResults(),
      dodChecks: createAllSatisfiedDoDChecks(),
      waivers: [waiver],
      evaluatedAt: '2026-04-14T00:00:00.000Z',
    })

    expect(result.decision).toBe('FAIL')
    expect(result.phase5Blocked).toBe(true)
    expect(result.invalidWaivers).toContain('WVR4-001')
  })

  test('CLS4-004 all gates pass should return PASS and acceptance template', () => {
    const result = evaluatePhase4Closure({
      gateResults: createGreenHardGateResults(),
      dodChecks: createAllSatisfiedDoDChecks(),
    })
    const template = createPhase4AcceptanceReportTemplate({
      reportId: 'phase4-acceptance-2026-04-14',
      commit: 'abc4567',
      date: '2026-04-14',
      owner: 'rewrite-orchestrator',
    })

    expect(result.decision).toBe('PASS')
    expect(result.phase5Blocked).toBe(false)
    expect(result.acceptanceReport).toBeDefined()
    expect(result.acceptanceReport?.decision).toBe('PASS')
    expect(result.acceptanceReport?.commands.length).toBe(7)
    expect(template.reportId).toBe('phase4-acceptance-2026-04-14')
    expect(template.commands.map((item) => item.gate)).toEqual([
      'build',
      'typecheck',
      'lint',
      'phase1',
      'phase2',
      'phase3',
      'phase4',
    ])
  })
})
