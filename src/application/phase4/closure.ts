export type Phase4HardGate =
  | 'build'
  | 'typecheck'
  | 'lint'
  | 'phase1'
  | 'phase2'
  | 'phase3'
  | 'phase4'
export type Phase4ClosureDecision = 'PASS' | 'PASS_WITH_WAIVER' | 'FAIL'
export type Phase4WaiverRisk = 'low' | 'medium' | 'high' | 'critical'
export type Phase4DoDCaseId = 'CLS4-001' | 'CLS4-002' | 'CLS4-003' | 'CLS4-004'

export interface Phase4GateCommand {
  gate: Phase4HardGate
  command: string
}

export interface Phase4GateResult {
  gate: Phase4HardGate
  command: string
  success: boolean
  summary?: string
}

export interface Phase4CommandTemplateRecord extends Phase4GateCommand {
  status: 'pending' | 'pass' | 'fail'
  result: string
}

export interface Phase4AcceptanceReportTemplate {
  reportId: string
  commit: string
  date: string
  owner: string
  commands: Phase4CommandTemplateRecord[]
  results: {
    passed: number
    failed: number
    notes: string[]
  }
  decision: 'PENDING' | Phase4ClosureDecision
}

export interface Phase4RiskWaiver {
  waiverId: string
  risk: Phase4WaiverRisk
  impactScope: string
  mitigation: string
  expiresOn: string
  owner: string
  approver: string
  approved: boolean
  status?: 'open' | 'closed'
}

export interface Phase4DoDCheck {
  id: Phase4DoDCaseId
  satisfied: boolean
  note?: string
}

export interface Phase4ClosureInput {
  gateResults: Phase4GateResult[]
  dodChecks?: Phase4DoDCheck[]
  waivers?: Phase4RiskWaiver[]
  reviewOwner?: string
  nextReviewAt?: string
  evaluatedAt?: string
}

export interface Phase4ClosureResult {
  decision: Phase4ClosureDecision
  phase5Blocked: boolean
  reason: string
  missingGates: Phase4HardGate[]
  failedGates: Phase4HardGate[]
  invalidWaivers: string[]
  dodFailures: Phase4DoDCaseId[]
  rollbackActions: string[]
  acceptanceReport?: Phase4AcceptanceReportTemplate
  retryOwner?: string
  nextReviewAt?: string
}

const REQUIRED_HARD_GATES: ReadonlyArray<Phase4HardGate> = [
  'build',
  'typecheck',
  'lint',
  'phase1',
  'phase2',
  'phase3',
  'phase4',
]

export const PHASE4_HARD_GATE_COMMANDS: ReadonlyArray<Phase4GateCommand> = [
  { gate: 'build', command: 'bun run build' },
  { gate: 'typecheck', command: 'bunx tsc --noEmit' },
  { gate: 'lint', command: 'bun run lint' },
  { gate: 'phase1', command: 'bun test src/__tests__/phase1*.test.ts' },
  { gate: 'phase2', command: 'bun test src/__tests__/phase2*.test.ts' },
  { gate: 'phase3', command: 'bun test src/__tests__/phase3*.test.ts' },
  { gate: 'phase4', command: 'bun test src/__tests__/phase4*.test.ts' },
]

export const PHASE4_DOD_CASE_IDS: ReadonlyArray<Phase4DoDCaseId> = [
  'CLS4-001',
  'CLS4-002',
  'CLS4-003',
  'CLS4-004',
]

export function createPhase4AcceptanceReportTemplate(
  input: Partial<Pick<Phase4AcceptanceReportTemplate, 'commit' | 'date' | 'owner' | 'reportId'>> = {},
): Phase4AcceptanceReportTemplate {
  return {
    reportId: input.reportId ?? '',
    commit: input.commit ?? '',
    date: input.date ?? new Date().toISOString().slice(0, 10),
    owner: input.owner ?? '',
    commands: PHASE4_HARD_GATE_COMMANDS.map((item) => ({
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

export function evaluatePhase4HardGateMatrix(results: Phase4GateResult[]): {
  missingGates: Phase4HardGate[]
  failedGates: Phase4HardGate[]
} {
  const statusByGate = new Map<Phase4HardGate, boolean>()
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

export function evaluatePhase4Closure(input: Phase4ClosureInput): Phase4ClosureResult {
  const evaluatedAt = input.evaluatedAt ?? new Date().toISOString()
  const gateStatus = evaluatePhase4HardGateMatrix(input.gateResults)
  const dodFailures = collectDoDFailures(input.dodChecks ?? [])
  const waiverStatus = validateWaivers(input.waivers ?? [], evaluatedAt)

  const blockers: string[] = []
  if (gateStatus.missingGates.length > 0) {
    blockers.push(`missing hard gates: ${gateStatus.missingGates.join(', ')}`)
  }
  if (gateStatus.failedGates.length > 0) {
    blockers.push(`failed hard gates: ${gateStatus.failedGates.join(', ')}`)
  }
  if (dodFailures.length > 0) {
    blockers.push(`DoD failed: ${dodFailures.join(', ')}`)
  }
  if (waiverStatus.invalidWaivers.length > 0) {
    blockers.push(`invalid waivers: ${waiverStatus.invalidWaivers.join(', ')}`)
  }
  if (waiverStatus.hasOpenHighRiskWaiver) {
    blockers.push('open high/critical waiver detected')
  }

  if (blockers.length > 0) {
    return {
      decision: 'FAIL',
      phase5Blocked: true,
      reason: `Do not proceed to Phase 5: ${blockers.join(' | ')}`,
      missingGates: gateStatus.missingGates,
      failedGates: gateStatus.failedGates,
      invalidWaivers: waiverStatus.invalidWaivers,
      dodFailures,
      rollbackActions: buildPhase4RollbackBaseline(),
      retryOwner: input.reviewOwner,
      nextReviewAt: input.nextReviewAt,
    }
  }

  const acceptanceReport = createPhase4AcceptanceReportTemplate()
  acceptanceReport.decision = waiverStatus.hasOpenLowMediumWaiver ? 'PASS_WITH_WAIVER' : 'PASS'
  acceptanceReport.results = {
    passed: REQUIRED_HARD_GATES.length,
    failed: 0,
    notes: waiverStatus.hasOpenLowMediumWaiver
      ? ['Closure passed with active low/medium waivers.']
      : ['All phase4 hard gates and DoD checks passed.'],
  }

  if (waiverStatus.hasOpenLowMediumWaiver) {
    return {
      decision: 'PASS_WITH_WAIVER',
      phase5Blocked: false,
      reason: 'Phase 4 closure accepted with active low/medium waivers.',
      missingGates: [],
      failedGates: [],
      invalidWaivers: [],
      dodFailures: [],
      rollbackActions: buildPhase4RollbackBaseline(),
      acceptanceReport,
    }
  }

  return {
    decision: 'PASS',
    phase5Blocked: false,
    reason: 'Phase 4 closure accepted. Phase 5 can proceed.',
    missingGates: [],
    failedGates: [],
    invalidWaivers: [],
    dodFailures: [],
    rollbackActions: buildPhase4RollbackBaseline(),
    acceptanceReport,
  }
}

export function buildPhase4RollbackBaseline(): string[] {
  return [
    'Force orchestrator mode to plan-only (ask) to stop autonomous task execution.',
    'Disable task fan-out and agent aggregation; fallback to single task serial mode.',
    'Lock tool execution to inherited ask mode until permission chain is revalidated.',
    'Re-run phase1_* + phase2_* + phase3_* + phase4_* gates before reopening Phase 5.',
  ]
}

function collectDoDFailures(checks: Phase4DoDCheck[]): Phase4DoDCaseId[] {
  const byId = new Map<Phase4DoDCaseId, boolean>()
  for (const id of PHASE4_DOD_CASE_IDS) {
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
  return PHASE4_DOD_CASE_IDS.filter((id) => !byId.get(id))
}

function validateWaivers(
  waivers: Phase4RiskWaiver[],
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
