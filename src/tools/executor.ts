import type { AppStore } from '../state/store.js'
import { getTools } from './registry.js'
import type { ToolContext } from '../definitions/types/index.js'
import { createSpanId } from '../observability/ids.js'
import { getTraceBus } from '../observability/trace-bus.js'
import { evaluatePermission } from '../platform/permission/engine.js'
import { assessToolRisk } from '../platform/permission/risk.js'
import {
  evaluateBoundary,
  getPhase2BoundaryEnforcement,
  isPhase2BoundaryHardeningEnabled,
} from '../platform/permission/boundary.js'
import type { PermissionAction, PermissionRule } from '../platform/permission/index.js'
import type { BoundaryEnforcement, BoundaryReasonCode } from '../platform/permission/boundary.js'
import {
  createAuditExecutionFinishedEvent,
  createAuditExecutionStartedEvent,
  createAuditPermissionDecidedEvent,
  createAuditRequestedEvent,
  recordAuditEvent,
} from '../application/query/audit/index.js'

type DenyReasonCode =
  | 'approval_required_in_auto'
  | 'rule_denied'
  | 'user_denied'
  | 'plan_mode_blocked'
  | BoundaryReasonCode

interface GovernanceMeta {
  toolName: string
  riskLevel: string
  matchedRuleIds: string[]
  mode: string
  boundaryBlocked?: boolean
  boundaryReasonCode?: string
  boundaryDetails?: Record<string, unknown>
}

export async function executeTool(
  name: string,
  input: unknown,
  store: AppStore,
): Promise<string> {
  const state = store.getState()
  const traceBus = getTraceBus()
  const requestId = createSpanId()
  const toolSpanId = requestId
  const toolStart = Date.now()
  const startedAt = new Date(toolStart).toISOString()
  const registry = getTools()
  const risk = assessToolRisk(name, input, state.cwd)
  const tool = registry.get(name)
  let auditSeq = 1

  const nextAuditSeq = (): number => {
    const value = auditSeq
    auditSeq += 1
    return value
  }

  recordAuditEvent(
    createAuditRequestedEvent({
      sessionId: state.sessionId,
      traceId: state.traceId,
      turnId: state.currentTurnId ?? undefined,
      requestId,
      toolName: name,
      startedAt,
      mode: state.permissionMode,
      seq: nextAuditSeq(),
    }),
  )

  const context: ToolContext = {
    cwd: state.cwd,
    permissionMode: state.permissionMode,
  }

  const governanceEnabled = isPhase2ExecutorGovernanceEnabled()
  const mode = state.permissionMode
  let permissionAction: PermissionAction | 'deny' = mode === 'ask' ? 'ask' : 'allow'
  let reasonCode = mode === 'ask' ? 'approval_required_in_auto' : 'approved'
  let matchedRuleIds: string[] = []
  let boundaryBlocked = false
  let boundaryReasonCode: string | undefined

  if (!tool) {
    permissionAction = 'deny'
    reasonCode = 'unknown_tool'
    recordAuditEvent(
      createAuditPermissionDecidedEvent({
        sessionId: state.sessionId,
        traceId: state.traceId,
        turnId: state.currentTurnId ?? undefined,
        requestId,
        toolName: name,
        riskLevel: risk.riskLevel,
        baselineLevel: risk.baselineLevel,
        reasonCodes: risk.reasonCodes,
        permissionAction,
        reasonCode,
        mode,
        matchedRuleIds,
        seq: nextAuditSeq(),
      }),
    )
    recordAuditEvent(
      createAuditExecutionFinishedEvent({
        sessionId: state.sessionId,
        traceId: state.traceId,
        turnId: state.currentTurnId ?? undefined,
        requestId,
        toolName: name,
        success: false,
        result: 'error',
        endedAt: new Date().toISOString(),
        durationMs: Date.now() - toolStart,
        reasonCode,
        errorMessage: `Unknown tool: ${name}`,
        boundaryBlocked: false,
        seq: nextAuditSeq(),
      }),
    )
    traceBus.emit({
      stage: 'tool',
      event: 'call_error',
      status: 'error',
      session_id: state.sessionId,
      trace_id: state.traceId,
      turn_id: state.currentTurnId ?? undefined,
      span_id: toolSpanId,
      payload: { toolName: name, error: `Unknown tool: ${name}` },
    })
    return `Error: Unknown tool "${name}"`
  }

  if (!governanceEnabled) {
    permissionAction = mode === 'ask' ? 'ask' : 'allow'
    reasonCode = mode === 'ask' ? 'approval_required_in_auto' : 'approved'
    matchedRuleIds = []
    recordAuditEvent(
      createAuditPermissionDecidedEvent({
        sessionId: state.sessionId,
        traceId: state.traceId,
        turnId: state.currentTurnId ?? undefined,
        requestId,
        toolName: name,
        riskLevel: risk.riskLevel,
        baselineLevel: risk.baselineLevel,
        reasonCodes: risk.reasonCodes,
        permissionAction,
        reasonCode,
        mode,
        matchedRuleIds,
        seq: nextAuditSeq(),
      }),
    )
    const legacyDenied = await executeLegacyPermissionPath({
      name,
      input,
      store,
      toolStart,
      toolSpanId,
    })
    if (legacyDenied) {
      recordAuditEvent(
        createAuditExecutionFinishedEvent({
          sessionId: state.sessionId,
          traceId: state.traceId,
          turnId: state.currentTurnId ?? undefined,
          requestId,
          toolName: name,
          success: false,
          result: 'denied',
          endedAt: new Date().toISOString(),
          durationMs: Date.now() - toolStart,
          reasonCode: 'user_denied',
          errorMessage: legacyDenied,
          boundaryBlocked: false,
          seq: nextAuditSeq(),
        }),
      )
      return legacyDenied
    }
  } else {
    const rules = loadPermissionRules()
    const decision = evaluatePermission(rules, {
      toolName: name,
      riskLevel: risk.riskLevel,
    })
    permissionAction = decision.action
    matchedRuleIds = decision.matchedRuleIds
    reasonCode = toReasonCode(mode, decision.action)
    traceBus.emit({
      stage: 'permission',
      event: 'decision',
      status: decision.action === 'deny' ? 'error' : 'ok',
      session_id: state.sessionId,
      trace_id: state.traceId,
      turn_id: state.currentTurnId ?? undefined,
      span_id: createSpanId(),
      payload: {
        toolName: name,
        mode,
        action: decision.action,
        riskLevel: risk.riskLevel,
        baselineLevel: risk.baselineLevel,
        reasonCodes: risk.reasonCodes,
        matchedRuleIds: decision.matchedRuleIds,
        reasonCode: toReasonCode(mode, decision.action),
      },
    })
    recordAuditEvent(
      createAuditPermissionDecidedEvent({
        sessionId: state.sessionId,
        traceId: state.traceId,
        turnId: state.currentTurnId ?? undefined,
        requestId,
        toolName: name,
        riskLevel: risk.riskLevel,
        baselineLevel: risk.baselineLevel,
        reasonCodes: risk.reasonCodes,
        permissionAction,
        reasonCode,
        mode,
        matchedRuleIds,
        seq: nextAuditSeq(),
      }),
    )

    const denyResult = await runGovernanceModeGate({
      mode,
      action: decision.action,
      name,
      input,
      store,
      riskLevel: risk.riskLevel,
      matchedRuleIds: decision.matchedRuleIds,
    })
    if (denyResult) {
      const denyReasonCode = extractPermissionDeniedReasonCode(denyResult) ?? reasonCode
      recordAuditEvent(
        createAuditExecutionFinishedEvent({
          sessionId: state.sessionId,
          traceId: state.traceId,
          turnId: state.currentTurnId ?? undefined,
          requestId,
          toolName: name,
          success: false,
          result: 'denied',
          endedAt: new Date().toISOString(),
          durationMs: Date.now() - toolStart,
          reasonCode: denyReasonCode,
          errorMessage: denyResult,
          boundaryBlocked: false,
          seq: nextAuditSeq(),
        }),
      )
      traceBus.emit({
        stage: 'tool',
        event: 'call_error',
        status: 'error',
        session_id: state.sessionId,
        trace_id: state.traceId,
        turn_id: state.currentTurnId ?? undefined,
        span_id: toolSpanId,
        metrics: { duration_ms: Date.now() - toolStart },
        payload: { toolName: name, error: denyResult },
      })
      return denyResult
    }

    const boundary = evaluateBoundary(name, input, state.cwd)
    if (isPhase2BoundaryHardeningEnabled()) {
      const boundaryDecision = await runBoundaryGate({
        mode,
        name,
        input,
        store,
        riskLevel: risk.riskLevel,
        matchedRuleIds,
        boundary,
        enforcement: getPhase2BoundaryEnforcement(),
      })

      boundaryBlocked = boundaryDecision.blocked
      boundaryReasonCode = boundaryDecision.reasonCode
      if (boundaryDecision.denyResult) {
        const denyReasonCode =
          extractPermissionDeniedReasonCode(boundaryDecision.denyResult) ??
          boundaryDecision.reasonCode ??
          reasonCode
        recordAuditEvent(
          createAuditExecutionFinishedEvent({
            sessionId: state.sessionId,
            traceId: state.traceId,
            turnId: state.currentTurnId ?? undefined,
            requestId,
            toolName: name,
            success: false,
            result: 'denied',
            endedAt: new Date().toISOString(),
            durationMs: Date.now() - toolStart,
            reasonCode: denyReasonCode,
            errorMessage: boundaryDecision.denyResult,
            boundaryBlocked,
            boundaryReasonCode,
            seq: nextAuditSeq(),
          }),
        )
        traceBus.emit({
          stage: 'tool',
          event: 'call_error',
          status: 'error',
          session_id: state.sessionId,
          trace_id: state.traceId,
          turn_id: state.currentTurnId ?? undefined,
          span_id: toolSpanId,
          metrics: { duration_ms: Date.now() - toolStart },
          payload: { toolName: name, error: boundaryDecision.denyResult },
        })
        return boundaryDecision.denyResult
      }
    }
  }

  recordAuditEvent(
    createAuditExecutionStartedEvent({
      sessionId: state.sessionId,
      traceId: state.traceId,
      turnId: state.currentTurnId ?? undefined,
      requestId,
      toolName: name,
      seq: nextAuditSeq(),
    }),
  )

  // Set progress
  store.getState().setToolProgress({
    name,
    status: 'running',
    startTime: Date.now(),
  })
  traceBus.emit({
    stage: 'tool',
    event: 'call_start',
    status: 'start',
    session_id: state.sessionId,
    trace_id: state.traceId,
    turn_id: state.currentTurnId ?? undefined,
    span_id: toolSpanId,
    payload: { toolName: name, input },
  })

  try {
    // 传递 store 给 tool，以便实时更新进度
    const result = await tool.execute(input, context, store)

    // 清除工具进度，让 Spinner 恢复显示 API 调用状态
    // 不显示 "完成" 状态，因为接下来还有 API 处理
    store.getState().setToolProgress(null)
    traceBus.emit({
      stage: 'tool',
      event: 'call_end',
      status: 'ok',
      session_id: state.sessionId,
      trace_id: state.traceId,
      turn_id: state.currentTurnId ?? undefined,
      span_id: toolSpanId,
      metrics: { duration_ms: Date.now() - toolStart },
      payload: {
        toolName: name,
        result_bytes: String(result ?? '').length,
      },
    })
    recordAuditEvent(
      createAuditExecutionFinishedEvent({
        sessionId: state.sessionId,
        traceId: state.traceId,
        turnId: state.currentTurnId ?? undefined,
        requestId,
        toolName: name,
        success: true,
        result: 'success',
        endedAt: new Date().toISOString(),
        durationMs: Date.now() - toolStart,
        boundaryBlocked,
        boundaryReasonCode,
        seq: nextAuditSeq(),
      }),
    )

    return String(result ?? '')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    store.getState().setToolProgress({
      name,
      status: 'error',
      message,
      startTime: Date.now(),
    })
    traceBus.emit({
      stage: 'tool',
      event: 'call_error',
      status: 'error',
      session_id: state.sessionId,
      trace_id: state.traceId,
      turn_id: state.currentTurnId ?? undefined,
      span_id: toolSpanId,
      metrics: { duration_ms: Date.now() - toolStart },
      payload: { toolName: name, error: message },
    })
    recordAuditEvent(
      createAuditExecutionFinishedEvent({
        sessionId: state.sessionId,
        traceId: state.traceId,
        turnId: state.currentTurnId ?? undefined,
        requestId,
        toolName: name,
        success: false,
        result: 'error',
        endedAt: new Date().toISOString(),
        durationMs: Date.now() - toolStart,
        reasonCode: 'tool_execution_error',
        errorMessage: message,
        boundaryBlocked,
        boundaryReasonCode,
        seq: nextAuditSeq(),
      }),
    )

    return `Error: ${message}`
  }
}

interface LegacyPermissionArgs {
  name: string
  input: unknown
  store: AppStore
  toolStart: number
  toolSpanId: string
}

async function executeLegacyPermissionPath(args: LegacyPermissionArgs): Promise<string | null> {
  const { name, input, store, toolStart, toolSpanId } = args
  const state = store.getState()
  const traceBus = getTraceBus()

  if (state.permissionMode === 'ask') {
    traceBus.emit({
      stage: 'permission',
      event: 'prompt_request',
      status: 'start',
      session_id: state.sessionId,
      trace_id: state.traceId,
      turn_id: state.currentTurnId ?? undefined,
      span_id: createSpanId(),
      payload: { toolName: name },
    })
    const approved = await promptApproval(name, input, store)
    if (!approved) {
      traceBus.emit({
        stage: 'tool',
        event: 'call_error',
        status: 'error',
        session_id: state.sessionId,
        trace_id: state.traceId,
        turn_id: state.currentTurnId ?? undefined,
        span_id: toolSpanId,
        metrics: { duration_ms: Date.now() - toolStart },
        payload: { toolName: name, error: 'Denied by user' },
      })
      return `Tool ${name} was denied by user`
    }
  } else {
    traceBus.emit({
      stage: 'permission',
      event: 'auto_allow',
      status: 'ok',
      session_id: state.sessionId,
      trace_id: state.traceId,
      turn_id: state.currentTurnId ?? undefined,
      span_id: createSpanId(),
      payload: { toolName: name, mode: state.permissionMode },
      priority: 'low',
    })
  }
  return null
}

interface ModeGateArgs {
  mode: ToolContext['permissionMode']
  action: PermissionAction
  name: string
  input: unknown
  store: AppStore
  riskLevel: string
  matchedRuleIds: string[]
}

interface BoundaryGateArgs {
  mode: ToolContext['permissionMode']
  name: string
  input: unknown
  store: AppStore
  riskLevel: string
  matchedRuleIds: string[]
  boundary: ReturnType<typeof evaluateBoundary>
  enforcement: BoundaryEnforcement
}

interface BoundaryGateDecision {
  denyResult: string | null
  blocked: boolean
  reasonCode?: BoundaryReasonCode
}

async function runGovernanceModeGate(args: ModeGateArgs): Promise<string | null> {
  const { mode, action, name, input, store, riskLevel, matchedRuleIds } = args
  const state = store.getState()
  const traceBus = getTraceBus()
  const meta: GovernanceMeta = { toolName: name, riskLevel, matchedRuleIds, mode }

  if (mode === 'plan') {
    return formatPermissionDenied(
      'plan_mode_blocked',
      `Tool ${name} cannot run in plan mode`,
      meta,
    )
  }

  if (mode === 'auto') {
    if (action === 'allow') {
      return null
    }
    if (action === 'ask') {
      return formatPermissionDenied(
        'approval_required_in_auto',
        `Tool ${name} requires approval in auto mode`,
        meta,
      )
    }
    return formatPermissionDenied('rule_denied', `Tool ${name} is blocked by policy`, meta)
  }

  if (action === 'allow') {
    return null
  }
  if (action === 'deny') {
    return formatPermissionDenied('rule_denied', `Tool ${name} is blocked by policy`, meta)
  }

  traceBus.emit({
    stage: 'permission',
    event: 'prompt_request',
    status: 'start',
    session_id: state.sessionId,
    trace_id: state.traceId,
    turn_id: state.currentTurnId ?? undefined,
    span_id: createSpanId(),
    payload: { toolName: name, mode, reasonCode: 'approval_required_in_auto', riskLevel },
  })
  const approved = await promptApproval(name, input, store)
  traceBus.emit({
    stage: 'permission',
    event: 'prompt_result',
    status: approved ? 'ok' : 'error',
    session_id: state.sessionId,
    trace_id: state.traceId,
    turn_id: state.currentTurnId ?? undefined,
    span_id: createSpanId(),
    payload: {
      toolName: name,
      mode,
      approved,
      reasonCode: approved ? 'approved' : 'user_denied',
      riskLevel,
    },
  })
  if (approved) {
    return null
  }

  return formatPermissionDenied('user_denied', `Tool ${name} was denied by user`, meta)
}

async function runBoundaryGate(args: BoundaryGateArgs): Promise<BoundaryGateDecision> {
  const { mode, name, input, store, riskLevel, matchedRuleIds, boundary, enforcement } = args
  const state = store.getState()
  const traceBus = getTraceBus()
  traceBus.emit({
    stage: 'permission',
    event: 'boundary_gate',
    status: boundary.blocked ? 'error' : 'ok',
    session_id: state.sessionId,
    trace_id: state.traceId,
    turn_id: state.currentTurnId ?? undefined,
    span_id: createSpanId(),
    payload: {
      toolName: name,
      mode,
      riskLevel,
      matchedRuleIds,
      boundaryBlocked: boundary.blocked,
      boundaryReasonCode: boundary.reasonCode,
      boundaryEnforcement: enforcement,
      boundaryDetails: boundary.details,
    },
  })

  if (!boundary.blocked) {
    return { denyResult: null, blocked: false }
  }

  const reasonCode = boundary.reasonCode
  if (!reasonCode) {
    return {
      denyResult: formatPermissionDenied(
        'rule_denied',
        `Tool ${name} is blocked by boundary policy`,
        {
          toolName: name,
          mode,
          riskLevel,
          matchedRuleIds,
          boundaryBlocked: true,
          boundaryDetails: boundary.details,
        },
      ),
      blocked: true,
    }
  }

  const meta: GovernanceMeta = {
    toolName: name,
    mode,
    riskLevel,
    matchedRuleIds,
    boundaryBlocked: true,
    boundaryReasonCode: reasonCode,
    boundaryDetails: boundary.details,
  }

  if (enforcement === 'ask') {
    if (mode === 'auto') {
      return {
        denyResult: formatPermissionDenied(
          'approval_required_in_auto',
          `Tool ${name} requires boundary approval in auto mode`,
          meta,
        ),
        blocked: true,
        reasonCode,
      }
    }

    traceBus.emit({
      stage: 'permission',
      event: 'prompt_request',
      status: 'start',
      session_id: state.sessionId,
      trace_id: state.traceId,
      turn_id: state.currentTurnId ?? undefined,
      span_id: createSpanId(),
      payload: {
        toolName: name,
        mode,
        reasonCode,
        riskLevel,
        boundaryBlocked: true,
      },
    })
    const approved = await promptApproval(name, input, store)
    traceBus.emit({
      stage: 'permission',
      event: 'prompt_result',
      status: approved ? 'ok' : 'error',
      session_id: state.sessionId,
      trace_id: state.traceId,
      turn_id: state.currentTurnId ?? undefined,
      span_id: createSpanId(),
      payload: {
        toolName: name,
        mode,
        approved,
        reasonCode: approved ? 'approved' : 'user_denied',
        riskLevel,
        boundaryBlocked: true,
        boundaryReasonCode: reasonCode,
      },
    })
    if (approved) {
      return { denyResult: null, blocked: false, reasonCode }
    }
    return {
      denyResult: formatPermissionDenied(
        'user_denied',
        `Tool ${name} was denied by user`,
        meta,
      ),
      blocked: true,
      reasonCode,
    }
  }

  return {
    denyResult: formatPermissionDenied(
      reasonCode,
      boundary.userMessage ?? `Tool ${name} is blocked by boundary policy`,
      meta,
    ),
    blocked: true,
    reasonCode,
  }
}

function formatPermissionDenied(
  reasonCode: DenyReasonCode,
  userMessage: string,
  meta: GovernanceMeta,
): string {
  return [
    `Error: permission denied (${reasonCode})`,
    userMessage,
    JSON.stringify({ reasonCode, userMessage, meta }),
  ].join('\n')
}

function loadPermissionRules(env: NodeJS.ProcessEnv = process.env): PermissionRule[] {
  const raw = env.PHASE2_PERMISSION_RULES_JSON
  if (!raw) {
    return [defaultAllowRule()]
  }

  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return [defaultAllowRule()]
    }
    const rules = parsed.filter((item): item is PermissionRule => isPermissionRule(item))
    if (rules.length === 0) {
      return [defaultAllowRule()]
    }
    return rules
  } catch {
    return [defaultAllowRule()]
  }
}

function isPermissionRule(value: unknown): value is PermissionRule {
  if (!value || typeof value !== 'object') {
    return false
  }
  const rule = value as Partial<PermissionRule>
  return (
    typeof rule.id === 'string' &&
    (rule.action === 'allow' || rule.action === 'ask' || rule.action === 'deny') &&
    (rule.source === 'default' || rule.source === 'user' || rule.source === 'session') &&
    typeof rule.riskLevel === 'string'
  )
}

function defaultAllowRule(): PermissionRule {
  return {
    id: 'default-allow-all',
    action: 'allow',
    source: 'default',
    scope: 'global',
    riskLevel: 'any',
  }
}

function toReasonCode(
  mode: ToolContext['permissionMode'],
  action: PermissionAction,
): DenyReasonCode | 'approved' {
  if (mode === 'plan') {
    return 'plan_mode_blocked'
  }
  if (mode === 'auto') {
    if (action === 'ask') return 'approval_required_in_auto'
    if (action === 'deny') return 'rule_denied'
    return 'approved'
  }
  if (action === 'deny') {
    return 'rule_denied'
  }
  if (action === 'ask') {
    return 'approval_required_in_auto'
  }
  return 'approved'
}

function extractPermissionDeniedReasonCode(value: string): string | null {
  const match = value.match(/permission denied \(([^)]+)\)/i)
  if (!match || !match[1]) {
    return null
  }
  return match[1]
}

export function isPhase2ExecutorGovernanceEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env.phase2ExecutorGovernanceEnabled ?? env.PHASE2_EXECUTOR_GOVERNANCE_ENABLED
  if (value == null) {
    return true
  }
  const normalized = value.trim().toLowerCase()
  return normalized !== '0' && normalized !== 'false' && normalized !== 'off'
}

async function promptApproval(
  toolName: string,
  input: unknown,
  store: AppStore,
): Promise<boolean> {
  return new Promise((resolve) => {
    store.getState().setPendingTool({
      id: `${toolName}-${Date.now()}`,
      name: toolName,
      input,
      resolve,
    })
  })
}
