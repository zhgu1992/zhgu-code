import type { AppStore } from '../../state/store.js'
import type { PermissionMode } from '../../definitions/types/permission.js'
import {
  createPlanStateMachine,
  IllegalPlanTransitionError,
  type PlanSnapshot,
} from '../../application/orchestrator/plan-state.js'

type CommandName =
  | '/mode'
  | '/plan'
  | '/implement'
  | '/auto'
  | '/ask'
  | '/submit'
  | '/approve'
  | '/reject'

export interface ModeCommandDefinition {
  command: CommandName
  usage: string
  description: string
}

interface ParsedCommand {
  handled: boolean
  command?: CommandName
  mode?: PermissionMode
  approvalAction?: 'submit' | 'approve' | 'reject'
  error?: string
}

export interface ModeCommandResult {
  handled: boolean
  switched: boolean
  mode?: PermissionMode
  message?: string
}

const MODES: PermissionMode[] = ['ask', 'auto', 'plan']
const IMPLEMENT_MODES: Array<Exclude<PermissionMode, 'plan'>> = ['ask', 'auto']
const MODE_COMMAND_DEFINITIONS: ModeCommandDefinition[] = [
  {
    command: '/plan',
    usage: '/plan',
    description: 'Switch to plan mode',
  },
  {
    command: '/implement',
    usage: '/implement [ask|auto]',
    description: 'Exit plan mode and switch to ask (default) or auto',
  },
  {
    command: '/ask',
    usage: '/ask',
    description: 'Switch to ask mode',
  },
  {
    command: '/auto',
    usage: '/auto',
    description: 'Switch to auto mode',
  },
  {
    command: '/mode',
    usage: '/mode <plan|ask|auto>',
    description: 'Set permission mode explicitly',
  },
  {
    command: '/submit',
    usage: '/submit',
    description: 'Submit active plan for approval',
  },
  {
    command: '/approve',
    usage: '/approve',
    description: 'Approve active plan and allow execution chain',
  },
  {
    command: '/reject',
    usage: '/reject',
    description: 'Reject active plan with permission_denied',
  },
]

export function getModeCommandDefinitions(): ModeCommandDefinition[] {
  return MODE_COMMAND_DEFINITIONS
}

function parseModeCommand(input: string): ParsedCommand {
  const trimmed = input.trim()
  if (!trimmed.startsWith('/')) {
    return { handled: false }
  }

  const parts = trimmed.split(/\s+/)
  const [rawCommand, rawArg] = parts
  const command = rawCommand.toLowerCase() as CommandName

  if (command === '/plan') {
    if (parts.length > 1) {
      return { handled: true, command, error: 'Usage: /plan' }
    }
    return { handled: true, command, mode: 'plan' }
  }

  if (command === '/ask') {
    if (parts.length > 1) {
      return { handled: true, command, error: 'Usage: /ask' }
    }
    return { handled: true, command, mode: 'ask' }
  }

  if (command === '/auto') {
    if (parts.length > 1) {
      return { handled: true, command, error: 'Usage: /auto' }
    }
    return { handled: true, command, mode: 'auto' }
  }

  if (command === '/mode') {
    if (parts.length !== 2 || !rawArg) {
      return { handled: true, command, error: 'Usage: /mode <plan|ask|auto>' }
    }
    const targetMode = rawArg.toLowerCase() as PermissionMode
    if (!MODES.includes(targetMode)) {
      return {
        handled: true,
        command,
        error: `Invalid mode "${rawArg}". Use: plan | ask | auto`,
      }
    }
    return { handled: true, command, mode: targetMode }
  }

  if (command === '/implement') {
    if (parts.length > 2) {
      return { handled: true, command, error: 'Usage: /implement [ask|auto]' }
    }
    if (!rawArg) {
      return { handled: true, command, mode: 'ask' }
    }
    const implementMode = rawArg.toLowerCase() as Exclude<PermissionMode, 'plan'>
    if (!IMPLEMENT_MODES.includes(implementMode)) {
      return {
        handled: true,
        command,
        error: `Invalid implement mode "${rawArg}". Use: ask | auto`,
      }
    }
    return { handled: true, command, mode: implementMode }
  }

  if (command === '/submit') {
    if (parts.length > 1) {
      return { handled: true, command, error: 'Usage: /submit' }
    }
    return { handled: true, command, approvalAction: 'submit' }
  }

  if (command === '/approve') {
    if (parts.length > 1) {
      return { handled: true, command, error: 'Usage: /approve' }
    }
    return { handled: true, command, approvalAction: 'approve' }
  }

  if (command === '/reject') {
    if (parts.length > 1) {
      return { handled: true, command, error: 'Usage: /reject' }
    }
    return { handled: true, command, approvalAction: 'reject' }
  }

  return { handled: false }
}

function resolvePlanApprovalStatus(snapshot: PlanSnapshot): 'pending' | 'approved' | 'rejected' {
  if (snapshot.state === 'draft' || snapshot.state === 'awaiting-approval') {
    return 'pending'
  }
  if (snapshot.state === 'failed' && snapshot.terminalReason === 'permission_denied') {
    return 'rejected'
  }
  return 'approved'
}

function executeApprovalCommand(
  store: AppStore,
  parsed: ParsedCommand & { command: CommandName; approvalAction: 'submit' | 'approve' | 'reject' },
): ModeCommandResult {
  const state = store.getState()
  const activePlan = state.orchestratorRuntimeSession.activePlan
  if (parsed.approvalAction !== 'submit' && !activePlan) {
    return {
      handled: true,
      switched: false,
      message: 'No active plan. Run /plan then /submit first.',
    }
  }

  if (parsed.approvalAction === 'submit' && !activePlan && state.permissionMode !== 'plan') {
    return {
      handled: true,
      switched: false,
      message: 'Submit requires plan mode. Run /plan first.',
    }
  }

  const planId = activePlan?.planId ?? `plan_${state.sessionId}`
  const planMode = activePlan?.planMode ?? 'plan'
  const initialState = activePlan?.state ?? 'draft'
  const machine = createPlanStateMachine({
    planId,
    initialState,
  })

  try {
    const snapshot =
      parsed.approvalAction === 'submit'
        ? machine.transition({ type: 'submit_for_approval' })
        : parsed.approvalAction === 'approve'
          ? machine.transition({ type: 'approval_granted' })
          : machine.transition({ type: 'approval_rejected' })

    if (!activePlan) {
      state.setActivePlanContext({
        planId,
        planMode,
        state: snapshot.state,
        terminalReason: snapshot.terminalReason,
        planApprovalStatus: resolvePlanApprovalStatus(snapshot),
      })
    } else {
      state.patchActivePlanContext({
        state: snapshot.state,
        terminalReason: snapshot.terminalReason,
        planApprovalStatus: resolvePlanApprovalStatus(snapshot),
      })
    }

    const verb =
      parsed.approvalAction === 'submit'
        ? 'submitted for approval'
        : parsed.approvalAction === 'approve'
          ? 'approved'
          : 'rejected'

    return {
      handled: true,
      switched: false,
      message: `Plan ${planId} ${verb}: ${initialState} -> ${snapshot.state}.`,
    }
  } catch (error) {
    if (error instanceof IllegalPlanTransitionError) {
      return {
        handled: true,
        switched: false,
        message: `Invalid approval command in plan state "${error.state}".`,
      }
    }
    throw error
  }
}

export function executeModeCommand(store: AppStore, input: string): ModeCommandResult {
  const parsed = parseModeCommand(input)
  if (!parsed.handled) {
    return { handled: false, switched: false }
  }
  if (parsed.error) {
    return {
      handled: true,
      switched: false,
      message: parsed.error ?? 'Invalid mode command',
    }
  }

  if (parsed.approvalAction && parsed.command) {
    return executeApprovalCommand(store, {
      ...parsed,
      approvalAction: parsed.approvalAction,
      command: parsed.command,
    })
  }

  if (!parsed.mode || !parsed.command) {
    return {
      handled: true,
      switched: false,
      message: 'Invalid mode command',
    }
  }

  const before = store.getState().permissionMode
  store.getState().setPermissionMode(parsed.mode, {
    source: 'local_command',
    command: parsed.command,
  })
  const after = store.getState().permissionMode
  const switched = before !== after

  if (!switched) {
    return {
      handled: true,
      switched: false,
      mode: after,
      message: `Already in ${after} mode.`,
    }
  }

  return {
    handled: true,
    switched: true,
    mode: after,
    message: `Permission mode switched: ${before} -> ${after}.`,
  }
}
