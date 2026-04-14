import type { AppStore } from '../../state/store.js'
import type { PermissionMode } from '../../definitions/types/permission.js'

type CommandName = '/mode' | '/plan' | '/implement' | '/auto' | '/ask'

export interface ModeCommandDefinition {
  command: CommandName
  usage: string
  description: string
}

interface ParsedCommand {
  handled: boolean
  command?: CommandName
  mode?: PermissionMode
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

  return { handled: false }
}

export function executeModeCommand(store: AppStore, input: string): ModeCommandResult {
  const parsed = parseModeCommand(input)
  if (!parsed.handled) {
    return { handled: false, switched: false }
  }
  if (!parsed.mode || parsed.error) {
    return {
      handled: true,
      switched: false,
      message: parsed.error ?? 'Invalid mode command',
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
