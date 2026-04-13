import { describe, expect, test } from 'bun:test'
import {
  buildPhase3RollbackBaseline,
  createPhase3AcceptanceReportTemplate,
  createPhase3DeferredMapTemplate,
  evaluatePhase3Closure,
  evaluatePhase3HardGateMatrix,
  type Phase3DeferredMapItem,
  type Phase3DoDCheck,
  type Phase3GateResult,
} from '../application/phase3/closure.js'

function createGreenHardGateResults(): Phase3GateResult[] {
  return [
    { gate: 'build', command: 'bun run build', success: true },
    { gate: 'typecheck', command: 'bunx tsc --noEmit', success: true },
    { gate: 'lint', command: 'bun run lint', success: true },
    { gate: 'phase1', command: 'bun test src/__tests__/phase1*.test.ts', success: true },
    { gate: 'phase2', command: 'bun test src/__tests__/phase2*.test.ts', success: true },
    { gate: 'phase3', command: 'bun test src/__tests__/phase3*.test.ts', success: true },
  ]
}

function createAllSatisfiedDoDChecks(): Phase3DoDCheck[] {
  return [
    { id: 'CLS-001', satisfied: true },
    { id: 'CLS-002', satisfied: true },
    { id: 'CLS-003', satisfied: true },
    { id: 'CLS-004', satisfied: true },
  ]
}

function createDeferredMap(): Phase3DeferredMapItem[] {
  return [
    createPhase3DeferredMapTemplate({
      deferredId: 'DEF-001',
      title: '多 transport 扩展与连接池治理',
      riskLevel: 'high',
      targetWip: 'wipx-06',
      entryConditions: ['WP3-A 生命周期快照稳定', 'WP3-D 熔断快照可追溯'],
      rollbackBaseline: '回退到 Phase 3 单最小通路',
      owner: 'integration-owner',
      whyDeferred: '避免 Phase 3 范围漂移与复杂度失控',
      riskIfNotDeferred: 'Phase 3 交付延期且影响 Phase 4 依赖稳定性',
      expectedBenefit: '在 Extra-B 统一收敛 transport 抽象',
    }),
    createPhase3DeferredMapTemplate({
      deferredId: 'DEF-002',
      title: '复杂鉴权矩阵与凭据轮换',
      riskLevel: 'high',
      targetWip: 'wipx-06',
      entryConditions: ['WP3-D 来源校验语义冻结'],
      rollbackBaseline: '回退到最小来源校验 + 手动禁用',
      owner: 'security-owner',
      whyDeferred: '当前阶段仅保留最小安全闭环',
      riskIfNotDeferred: '鉴权改造会直接放大回归面',
      expectedBenefit: '在 Extra-B 一次性落地策略矩阵',
    }),
  ]
}

describe('Phase 3 Closure (wip3-06 / WP3-E)', () => {
  test('CLS-001 acceptance report and hard gate matrix are traceable and complete', () => {
    const template = createPhase3AcceptanceReportTemplate({
      commit: 'abc1234',
      date: '2026-04-13',
      owner: 'wp3e-owner',
      reportId: 'phase3-acceptance-2026-04-13',
    })
    const matrixStatus = evaluatePhase3HardGateMatrix(createGreenHardGateResults())

    expect(template.reportId).toBe('phase3-acceptance-2026-04-13')
    expect(template.commands.length).toBe(6)
    expect(template.commands.map((item) => item.gate)).toEqual([
      'build',
      'typecheck',
      'lint',
      'phase1',
      'phase2',
      'phase3',
    ])
    expect(matrixStatus.missingGates).toEqual([])
    expect(matrixStatus.failedGates).toEqual([])
  })

  test('CLS-002 each deferred item must map to Extra-B with complete fields', () => {
    const invalidMap = createDeferredMap().map((item, index) =>
      index === 1 ? { ...item, entryConditions: [] } : item,
    )
    const result = evaluatePhase3Closure({
      gateResults: createGreenHardGateResults(),
      dodChecks: createAllSatisfiedDoDChecks(),
      deferredMap: invalidMap,
      wip301Frozen: true,
      roadmapSync: { phase3RoadmapUpdated: true, extraBUpdated: true },
      rollbackDrill: { executed: true, mode: 'builtin_only', durationMinutes: 20 },
    })

    expect(result.decision).toBe('FAIL')
    expect(result.phase45Blocked).toBe(true)
    expect(result.deferredMapIssues).toContain('missing_entry_conditions:DEF-002')
    expect(result.rollbackActions).toEqual(buildPhase3RollbackBaseline())
  })

  test('CLS-003 builtin-only rollback drill must complete within 30 minutes', () => {
    const result = evaluatePhase3Closure({
      gateResults: createGreenHardGateResults(),
      dodChecks: createAllSatisfiedDoDChecks(),
      deferredMap: createDeferredMap(),
      wip301Frozen: true,
      roadmapSync: { phase3RoadmapUpdated: true, extraBUpdated: true },
      rollbackDrill: { executed: true, mode: 'builtin_only', durationMinutes: 42 },
      reviewOwner: 'ops-owner',
      nextReviewAt: '2026-04-14',
    })

    expect(result.decision).toBe('FAIL')
    expect(result.reason).toContain('rollback drill exceeded 30 minutes')
    expect(result.retryOwner).toBe('ops-owner')
    expect(result.nextReviewAt).toBe('2026-04-14')
  })

  test('CLS-004 roadmap writeback drift must block closure', () => {
    const result = evaluatePhase3Closure({
      gateResults: createGreenHardGateResults(),
      dodChecks: createAllSatisfiedDoDChecks(),
      deferredMap: createDeferredMap(),
      wip301Frozen: true,
      roadmapSync: { phase3RoadmapUpdated: true, extraBUpdated: false },
      rollbackDrill: { executed: true, mode: 'builtin_only', durationMinutes: 18 },
    })

    expect(result.decision).toBe('FAIL')
    expect(result.phase45Blocked).toBe(true)
    expect(result.reason).toContain('extra-b roadmap writeback missing')
  })

  test('all closure conditions satisfied should pass', () => {
    const result = evaluatePhase3Closure({
      gateResults: createGreenHardGateResults(),
      dodChecks: createAllSatisfiedDoDChecks(),
      deferredMap: createDeferredMap(),
      wip301Frozen: true,
      roadmapSync: { phase3RoadmapUpdated: true, extraBUpdated: true },
      rollbackDrill: { executed: true, mode: 'builtin_only', durationMinutes: 16 },
    })

    expect(result.decision).toBe('PASS')
    expect(result.phase45Blocked).toBe(false)
  })
})
