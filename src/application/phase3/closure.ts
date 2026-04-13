export type Phase3HardGate = 'build' | 'typecheck' | 'lint' | 'phase1' | 'phase2' | 'phase3'
export type Phase3ClosureDecision = 'PASS' | 'PASS_WITH_WAIVER' | 'FAIL'
export type Phase3WaiverRisk = 'low' | 'medium' | 'high' | 'critical'
export type Phase3DoDCaseId = 'CLS-001' | 'CLS-002' | 'CLS-003' | 'CLS-004'
export type Phase3ExtraBWip = 'wipx-05' | 'wipx-06' | 'wipx-07'

export interface Phase3GateCommand {
  gate: Phase3HardGate
  command: string
}

export interface Phase3GateResult {
  gate: Phase3HardGate
  command: string
  success: boolean
  summary?: string
}

export interface Phase3CommandTemplateRecord extends Phase3GateCommand {
  status: 'pending' | 'pass' | 'fail'
  result: string
}

export interface Phase3AcceptanceReportTemplate {
  commit: string
  date: string
  owner: string
  reportId: string
  commands: Phase3CommandTemplateRecord[]
  results: {
    passed: number
    failed: number
    notes: string[]
  }
  decision: 'PENDING' | Phase3ClosureDecision
}

export interface Phase3RiskWaiver {
  waiverId: string
  risk: Phase3WaiverRisk
  impactScope: string
  mitigation: string
  expiresOn: string
  owner: string
  approver: string
  approved: boolean
  status?: 'open' | 'closed'
}

export interface Phase3RiskWaiverTemplate extends Phase3RiskWaiver {
  status: 'open' | 'closed'
}

export interface Phase3DeferredMapItem {
  deferredId: string
  title: string
  riskLevel: 'low' | 'medium' | 'high'
  targetWip: Phase3ExtraBWip
  entryConditions: string[]
  rollbackBaseline: string
  owner: string
  whyDeferred: string
  riskIfNotDeferred: string
  expectedBenefit: string
  status?: 'mapped' | 'consumed'
}

export interface Phase3RoadmapSyncState {
  phase3RoadmapUpdated: boolean
  extraBUpdated: boolean
}

export interface Phase3RollbackDrill {
  executed: boolean
  mode: 'builtin_only'
  durationMinutes: number
}

export interface Phase3DoDCheck {
  id: Phase3DoDCaseId
  satisfied: boolean
  note?: string
}

export interface Phase3ClosureInput {
  gateResults: Phase3GateResult[]
  dodChecks?: Phase3DoDCheck[]
  waivers?: Phase3RiskWaiver[]
  deferredMap?: Phase3DeferredMapItem[]
  wip301Frozen?: boolean
  roadmapSync?: Phase3RoadmapSyncState
  rollbackDrill?: Phase3RollbackDrill
  reviewOwner?: string
  nextReviewAt?: string
  evaluatedAt?: string
}

export interface Phase3ClosureResult {
  decision: Phase3ClosureDecision
  phase45Blocked: boolean
  reason: string
  missingGates: Phase3HardGate[]
  failedGates: Phase3HardGate[]
  invalidWaivers: string[]
  dodFailures: Phase3DoDCaseId[]
  deferredMapIssues: string[]
  rollbackActions: string[]
  retryOwner?: string
  nextReviewAt?: string
}

const REQUIRED_HARD_GATES: ReadonlyArray<Phase3HardGate> = [
  'build',
  'typecheck',
  'lint',
  'phase1',
  'phase2',
  'phase3',
]

export const PHASE3_HARD_GATE_COMMANDS: ReadonlyArray<Phase3GateCommand> = [
  { gate: 'build', command: 'bun run build' },
  { gate: 'typecheck', command: 'bunx tsc --noEmit' },
  { gate: 'lint', command: 'bun run lint' },
  { gate: 'phase1', command: 'bun test src/__tests__/phase1*.test.ts' },
  { gate: 'phase2', command: 'bun test src/__tests__/phase2*.test.ts' },
  { gate: 'phase3', command: 'bun test src/__tests__/phase3*.test.ts' },
]

export const PHASE3_DOD_CASE_IDS: ReadonlyArray<Phase3DoDCaseId> = [
  'CLS-001',
  'CLS-002',
  'CLS-003',
  'CLS-004',
]

export function createPhase3AcceptanceReportTemplate(
  input: Partial<Pick<Phase3AcceptanceReportTemplate, 'commit' | 'date' | 'owner' | 'reportId'>> = {},
): Phase3AcceptanceReportTemplate {
  return {
    commit: input.commit ?? '',
    date: input.date ?? new Date().toISOString().slice(0, 10),
    owner: input.owner ?? '',
    reportId: input.reportId ?? '',
    commands: PHASE3_HARD_GATE_COMMANDS.map((item) => ({
      gate: item.gate,
      command: item.command,
      status: 'pending',
      result: '',
    })),
    results: {
      passed: 0,
      failed: 0,
      notes: [],
    },
    decision: 'PENDING',
  }
}

export function createPhase3RiskWaiverTemplate(
  input: Partial<Phase3RiskWaiverTemplate> = {},
): Phase3RiskWaiverTemplate {
  return {
    waiverId: input.waiverId ?? '',
    risk: input.risk ?? 'medium',
    impactScope: input.impactScope ?? '',
    mitigation: input.mitigation ?? '',
    expiresOn: input.expiresOn ?? '',
    owner: input.owner ?? '',
    approver: input.approver ?? '',
    approved: input.approved ?? false,
    status: input.status ?? 'open',
  }
}

export function createPhase3DeferredMapTemplate(
  input: Partial<Phase3DeferredMapItem> = {},
): Phase3DeferredMapItem {
  return {
    deferredId: input.deferredId ?? '',
    title: input.title ?? '',
    riskLevel: input.riskLevel ?? 'medium',
    targetWip: input.targetWip ?? 'wipx-05',
    entryConditions: input.entryConditions ?? ['TBD'],
    rollbackBaseline: input.rollbackBaseline ?? 'Phase 3 minimal integration loop',
    owner: input.owner ?? '',
    whyDeferred: input.whyDeferred ?? '',
    riskIfNotDeferred: input.riskIfNotDeferred ?? '',
    expectedBenefit: input.expectedBenefit ?? '',
    status: input.status ?? 'mapped',
  }
}

export function evaluatePhase3HardGateMatrix(results: Phase3GateResult[]): {
  missingGates: Phase3HardGate[]
  failedGates: Phase3HardGate[]
} {
  const statusByGate = new Map<Phase3HardGate, boolean>()
  for (const result of results) {
    const existing = statusByGate.get(result.gate)
    if (existing === false) {
      continue
    }
    statusByGate.set(result.gate, result.success)
  }

  const missingGates = REQUIRED_HARD_GATES.filter((gate) => !statusByGate.has(gate))
  const failedGates = REQUIRED_HARD_GATES.filter((gate) => statusByGate.get(gate) === false)
  return { missingGates, failedGates }
}

export function validatePhase3DeferredMap(items: Phase3DeferredMapItem[]): string[] {
  const issues: string[] = []
  const ids = new Set<string>()

  for (const item of items) {
    if (!item.deferredId.trim()) {
      issues.push('missing_deferred_id')
      continue
    }
    if (ids.has(item.deferredId)) {
      issues.push(`duplicate_deferred_id:${item.deferredId}`)
    }
    ids.add(item.deferredId)

    if (!item.title.trim()) {
      issues.push(`missing_title:${item.deferredId}`)
    }
    if (!item.owner.trim()) {
      issues.push(`missing_owner:${item.deferredId}`)
    }
    if (item.entryConditions.length === 0) {
      issues.push(`missing_entry_conditions:${item.deferredId}`)
    }
    if (!item.rollbackBaseline.trim()) {
      issues.push(`missing_rollback_baseline:${item.deferredId}`)
    }
    if (!item.whyDeferred.trim()) {
      issues.push(`missing_why_deferred:${item.deferredId}`)
    }
    if (!item.riskIfNotDeferred.trim()) {
      issues.push(`missing_risk_if_not_deferred:${item.deferredId}`)
    }
    if (!item.expectedBenefit.trim()) {
      issues.push(`missing_expected_benefit:${item.deferredId}`)
    }
  }

  return issues
}

export function evaluatePhase3Closure(input: Phase3ClosureInput): Phase3ClosureResult {
  const evaluatedAt = input.evaluatedAt ?? new Date().toISOString()
  const gateStatus = evaluatePhase3HardGateMatrix(input.gateResults)
  const waiverStatus = validateWaivers(input.waivers ?? [], evaluatedAt)
  const dodFailures = collectDoDFailures(input.dodChecks ?? [])
  const deferredMapIssues = validatePhase3DeferredMap(input.deferredMap ?? [])

  const blockers: string[] = []
  if (gateStatus.missingGates.length > 0) {
    blockers.push(`missing hard gates: ${gateStatus.missingGates.join(', ')}`)
  }
  if (gateStatus.failedGates.length > 0) {
    blockers.push(`failed hard gates: ${gateStatus.failedGates.join(', ')}`)
  }
  if (waiverStatus.invalidWaivers.length > 0) {
    blockers.push(`invalid waivers: ${waiverStatus.invalidWaivers.join(', ')}`)
  }
  if (waiverStatus.hasOpenHighRiskWaiver) {
    blockers.push('open high/critical waiver detected')
  }
  if (dodFailures.length > 0) {
    blockers.push(`DoD failed: ${dodFailures.join(', ')}`)
  }
  if (!input.wip301Frozen) {
    blockers.push('wip3-01 benchmark result not frozen')
  }
  if (deferredMapIssues.length > 0) {
    blockers.push(`deferred map issues: ${deferredMapIssues.join(', ')}`)
  }
  if ((input.deferredMap ?? []).length === 0) {
    blockers.push('deferred map empty')
  }
  if (!input.roadmapSync?.phase3RoadmapUpdated) {
    blockers.push('phase-3 roadmap writeback missing')
  }
  if (!input.roadmapSync?.extraBUpdated) {
    blockers.push('extra-b roadmap writeback missing')
  }
  if (!input.rollbackDrill?.executed || input.rollbackDrill.mode !== 'builtin_only') {
    blockers.push('builtin-only rollback drill missing')
  }
  if ((input.rollbackDrill?.durationMinutes ?? Number.POSITIVE_INFINITY) > 30) {
    blockers.push('rollback drill exceeded 30 minutes')
  }

  if (blockers.length > 0) {
    return {
      decision: 'FAIL',
      phase45Blocked: true,
      reason: `Do not proceed to Phase 4/5: ${blockers.join(' | ')}`,
      missingGates: gateStatus.missingGates,
      failedGates: gateStatus.failedGates,
      invalidWaivers: waiverStatus.invalidWaivers,
      dodFailures,
      deferredMapIssues,
      rollbackActions: buildPhase3RollbackBaseline(),
      retryOwner: input.reviewOwner,
      nextReviewAt: input.nextReviewAt,
    }
  }

  if (waiverStatus.hasOpenLowMediumWaiver) {
    return {
      decision: 'PASS_WITH_WAIVER',
      phase45Blocked: false,
      reason: 'Phase 3 closure accepted with active low/medium waivers.',
      missingGates: [],
      failedGates: [],
      invalidWaivers: [],
      dodFailures: [],
      deferredMapIssues: [],
      rollbackActions: buildPhase3RollbackBaseline(),
    }
  }

  return {
    decision: 'PASS',
    phase45Blocked: false,
    reason: 'Phase 3 closure accepted. Phase 4/5 can proceed.',
    missingGates: [],
    failedGates: [],
    invalidWaivers: [],
    dodFailures: [],
    deferredMapIssues: [],
    rollbackActions: buildPhase3RollbackBaseline(),
  }
}

export function buildPhase3RollbackBaseline(): string[] {
  return [
    'Switch registry to builtin-only mode and disable external callable tools.',
    'Open provider/plugin circuits for unstable integrations to stop retries.',
    'Disable plugin and MCP providers by static deny list until root cause is fixed.',
    'Re-run phase1_* + phase2_* + phase3_* tests before reopening external capabilities.',
  ]
}

function collectDoDFailures(checks: Phase3DoDCheck[]): Phase3DoDCaseId[] {
  const byId = new Map<Phase3DoDCaseId, boolean>()
  for (const id of PHASE3_DOD_CASE_IDS) {
    byId.set(id, false)
  }
  for (const check of checks) {
    if (!byId.has(check.id)) {
      continue
    }
    if (check.satisfied) {
      byId.set(check.id, true)
    }
  }
  return PHASE3_DOD_CASE_IDS.filter((id) => !byId.get(id))
}

function validateWaivers(
  waivers: Phase3RiskWaiver[],
  evaluatedAt: string,
): {
  invalidWaivers: string[]
  hasOpenLowMediumWaiver: boolean
  hasOpenHighRiskWaiver: boolean
} {
  const invalidWaivers: string[] = []
  let hasOpenLowMediumWaiver = false
  let hasOpenHighRiskWaiver = false
  const now = Date.parse(evaluatedAt)

  for (const waiver of waivers) {
    const status = waiver.status ?? 'open'
    if (status === 'closed') {
      continue
    }

    if (!waiver.waiverId || !waiver.approved || !waiver.approver || !waiver.owner) {
      invalidWaivers.push(waiver.waiverId || 'unknown_waiver')
      continue
    }

    const expiresAt = Date.parse(waiver.expiresOn)
    if (!Number.isFinite(expiresAt) || expiresAt <= now) {
      invalidWaivers.push(waiver.waiverId)
      continue
    }

    if (waiver.risk === 'high' || waiver.risk === 'critical') {
      hasOpenHighRiskWaiver = true
      continue
    }

    hasOpenLowMediumWaiver = true
  }

  return {
    invalidWaivers,
    hasOpenLowMediumWaiver,
    hasOpenHighRiskWaiver,
  }
}
