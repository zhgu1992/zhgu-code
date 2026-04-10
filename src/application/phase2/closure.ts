export type Phase2HardGate = 'build' | 'typecheck' | 'lint' | 'phase1' | 'phase2'
export type Phase2ClosureDecision = 'PASS' | 'PASS_WITH_WAIVER' | 'FAIL'
export type Phase2WaiverRisk = 'low' | 'medium' | 'high' | 'critical'
export type Phase2DoDCaseId =
  | 'CLS-001'
  | 'CLS-002'
  | 'CLS-003'
  | 'CLS-004'
  | 'CLS-005'
  | 'CLS-006'

export interface Phase2GateCommand {
  gate: Phase2HardGate
  command: string
}

export interface Phase2GateResult {
  gate: Phase2HardGate
  command: string
  success: boolean
  summary?: string
}

export interface Phase2CommandTemplateRecord extends Phase2GateCommand {
  status: 'pending' | 'pass' | 'fail'
  result: string
}

export interface Phase2AcceptanceReportTemplate {
  commit: string
  date: string
  owner: string
  commands: Phase2CommandTemplateRecord[]
  results: {
    passed: number
    failed: number
    notes: string[]
  }
  decision: 'PENDING' | Phase2ClosureDecision
}

export interface Phase2RiskWaiver {
  waiverId: string
  risk: Phase2WaiverRisk
  impactScope: string
  mitigation: string
  expiresOn: string
  owner: string
  approver: string
  approved: boolean
  status?: 'open' | 'closed'
}

export interface Phase2RiskWaiverTemplate {
  waiverId: string
  risk: Phase2WaiverRisk
  impactScope: string
  mitigation: string
  expiresOn: string
  owner: string
  approver: string
  approved: boolean
  status: 'open' | 'closed'
}

export interface Phase2SummaryTemplate {
  alignedItems: string[]
  unalignedItems: string[]
  residualRisks: string[]
  prePhase3Actions: string[]
  phase3Blockers: string[]
}

export interface Phase2DoDCheck {
  id: Phase2DoDCaseId
  satisfied: boolean
  note?: string
}

export interface Phase2ClosureInput {
  gateResults: Phase2GateResult[]
  waivers?: Phase2RiskWaiver[]
  dodChecks?: Phase2DoDCheck[]
  reviewOwner?: string
  nextReviewAt?: string
  evaluatedAt?: string
}

export interface Phase2ClosureResult {
  decision: Phase2ClosureDecision
  phase34Blocked: boolean
  reason: string
  missingGates: Phase2HardGate[]
  failedGates: Phase2HardGate[]
  invalidWaivers: string[]
  dodFailures: Phase2DoDCaseId[]
  rollbackActions: string[]
  retryOwner?: string
  nextReviewAt?: string
}

const REQUIRED_HARD_GATES: ReadonlyArray<Phase2HardGate> = [
  'build',
  'typecheck',
  'lint',
  'phase1',
  'phase2',
]

export const PHASE2_HARD_GATE_COMMANDS: ReadonlyArray<Phase2GateCommand> = [
  { gate: 'build', command: 'bun run build' },
  { gate: 'typecheck', command: 'bunx tsc --noEmit' },
  { gate: 'lint', command: 'bun run lint' },
  {
    gate: 'phase1',
    command:
      'bun test src/__tests__/phase1_recovery_hardening.test.ts src/__tests__/phase1_recovery_matrix.test.ts src/__tests__/phase1_trace_transition_assertions.test.ts src/__tests__/phase1_query_engine.test.ts',
  },
  { gate: 'phase2', command: 'bun test src/__tests__/phase2*.test.ts' },
]

export const PHASE2_DOD_CASE_IDS: ReadonlyArray<Phase2DoDCaseId> = [
  'CLS-001',
  'CLS-002',
  'CLS-003',
  'CLS-004',
  'CLS-005',
  'CLS-006',
]

export function createAcceptanceReportTemplate(
  input: Partial<Pick<Phase2AcceptanceReportTemplate, 'commit' | 'date' | 'owner'>> = {},
): Phase2AcceptanceReportTemplate {
  return {
    commit: input.commit ?? '',
    date: input.date ?? new Date().toISOString().slice(0, 10),
    owner: input.owner ?? '',
    commands: PHASE2_HARD_GATE_COMMANDS.map((item) => ({
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

export function createRiskWaiverTemplate(
  input: Partial<Phase2RiskWaiverTemplate> = {},
): Phase2RiskWaiverTemplate {
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

export function createPhaseSummaryTemplate(
  input: Partial<Phase2SummaryTemplate> = {},
): Phase2SummaryTemplate {
  return {
    alignedItems: input.alignedItems ?? ['TBD'],
    unalignedItems: input.unalignedItems ?? ['TBD'],
    residualRisks: input.residualRisks ?? ['TBD'],
    prePhase3Actions: input.prePhase3Actions ?? ['TBD'],
    phase3Blockers: input.phase3Blockers ?? ['TBD'],
  }
}

export function evaluateHardGateMatrix(results: Phase2GateResult[]): {
  missingGates: Phase2HardGate[]
  failedGates: Phase2HardGate[]
} {
  const passedOrFailedByGate = new Map<Phase2HardGate, boolean>()
  for (const result of results) {
    const existing = passedOrFailedByGate.get(result.gate)
    if (existing === false) {
      continue
    }
    passedOrFailedByGate.set(result.gate, result.success)
  }

  const missingGates = REQUIRED_HARD_GATES.filter((gate) => !passedOrFailedByGate.has(gate))
  const failedGates = REQUIRED_HARD_GATES.filter((gate) => passedOrFailedByGate.get(gate) === false)
  return { missingGates, failedGates }
}

export function validatePhase2Summary(summary: Phase2SummaryTemplate): string[] {
  const issues: string[] = []
  if (summary.alignedItems.length === 0) {
    issues.push('missing_aligned_items')
  }
  if (summary.unalignedItems.length === 0) {
    issues.push('missing_unaligned_items')
  }
  if (summary.phase3Blockers.length === 0) {
    issues.push('missing_phase3_blockers')
  }
  return issues
}

export function evaluatePhase2Closure(input: Phase2ClosureInput): Phase2ClosureResult {
  const evaluatedAt = input.evaluatedAt ?? new Date().toISOString()
  const gateStatus = evaluateHardGateMatrix(input.gateResults)
  const waiverStatus = validateWaivers(input.waivers ?? [], evaluatedAt)
  const dodFailures = collectDoDFailures(input.dodChecks ?? [])

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

  if (blockers.length > 0) {
    const fallbackOwner = input.reviewOwner
    const fallbackReviewAt = input.nextReviewAt
    const missingRetryMeta: string[] = []
    if (!fallbackOwner) {
      missingRetryMeta.push('retry owner')
    }
    if (!fallbackReviewAt) {
      missingRetryMeta.push('next review date')
    }
    if (missingRetryMeta.length > 0 && dodFailures.length > 0) {
      blockers.push(`missing retry metadata: ${missingRetryMeta.join(', ')}`)
    }

    return {
      decision: 'FAIL',
      phase34Blocked: true,
      reason: `Do not proceed to Phase 3/4: ${blockers.join(' | ')}`,
      missingGates: gateStatus.missingGates,
      failedGates: gateStatus.failedGates,
      invalidWaivers: waiverStatus.invalidWaivers,
      dodFailures,
      rollbackActions: buildPhase2RollbackBaseline(),
      retryOwner: fallbackOwner,
      nextReviewAt: fallbackReviewAt,
    }
  }

  if (waiverStatus.hasOpenLowMediumWaiver) {
    return {
      decision: 'PASS_WITH_WAIVER',
      phase34Blocked: false,
      reason: 'All hard gates passed; release allowed with active low/medium waiver',
      missingGates: [],
      failedGates: [],
      invalidWaivers: [],
      dodFailures: [],
      rollbackActions: [],
    }
  }

  return {
    decision: 'PASS',
    phase34Blocked: false,
    reason: 'All hard gates passed and no blocking waiver',
    missingGates: [],
    failedGates: [],
    invalidWaivers: [],
    dodFailures: [],
    rollbackActions: [],
  }
}

export function buildPhase2RollbackBaseline(): string[] {
  return [
    'phase2BoundaryHardeningEnabled=false',
    'phase2AuditChainEnabled=false',
    'phase2ExecutorGovernanceEnabled=false',
    'phase2RiskModelEnabled=false',
    'rollback to permissionMode legacy branch and freeze Phase 3/4',
  ]
}

function validateWaivers(
  waivers: Phase2RiskWaiver[],
  evaluatedAt: string,
): {
  invalidWaivers: string[]
  hasOpenHighRiskWaiver: boolean
  hasOpenLowMediumWaiver: boolean
} {
  const invalidWaivers: string[] = []
  let hasOpenHighRiskWaiver = false
  let hasOpenLowMediumWaiver = false
  const evaluationTime = Date.parse(evaluatedAt)

  for (const waiver of waivers) {
    const status = waiver.status ?? 'open'
    if (status === 'closed') {
      continue
    }

    const missingFields = [
      waiver.waiverId ? null : 'waiverId',
      waiver.impactScope ? null : 'impactScope',
      waiver.mitigation ? null : 'mitigation',
      waiver.expiresOn ? null : 'expiresOn',
      waiver.owner ? null : 'owner',
      waiver.approver ? null : 'approver',
      waiver.approved ? null : 'approved',
    ].filter((value): value is string => value !== null)

    if (missingFields.length > 0) {
      invalidWaivers.push(`${waiver.waiverId || 'unknown'}(${missingFields.join(',')})`)
      continue
    }

    const expiryTime = Date.parse(waiver.expiresOn)
    if (Number.isNaN(expiryTime) || expiryTime < evaluationTime) {
      invalidWaivers.push(`${waiver.waiverId}(expired_or_invalid_date)`)
      continue
    }

    if (waiver.risk === 'high' || waiver.risk === 'critical') {
      hasOpenHighRiskWaiver = true
      continue
    }

    hasOpenLowMediumWaiver = true
  }

  return { invalidWaivers, hasOpenHighRiskWaiver, hasOpenLowMediumWaiver }
}

function collectDoDFailures(checks: Phase2DoDCheck[]): Phase2DoDCaseId[] {
  const statusMap = new Map<Phase2DoDCaseId, boolean>()
  for (const check of checks) {
    statusMap.set(check.id, check.satisfied)
  }

  return PHASE2_DOD_CASE_IDS.filter((caseId) => statusMap.get(caseId) !== true)
}
