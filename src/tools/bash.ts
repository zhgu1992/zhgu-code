import { exec } from 'child_process'
import { promisify } from 'util'
import type { Tool } from '../types.js'

const execAsync = promisify(exec)

interface BashInput {
  command: string
  timeout?: number
  description?: string
}

export const BashTool: Tool<BashInput, string> = {
  name: 'Bash',
  description:
    'Execute a bash command. Use for running shell commands, scripts, and system operations.',
  inputSchema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The command to execute',
      },
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds (default: 120000)',
      },
      description: {
        type: 'string',
        description: 'Brief description of what the command does',
      },
    },
    required: ['command'],
  },

  async execute(input: BashInput) {
    const timeout = input.timeout || 120000

    try {
      const { stdout, stderr } = await execAsync(input.command, {
        timeout,
        maxBuffer: 10 * 1024 * 1024, // 10MB
      })

      let result = ''
      if (stdout) result += stdout
      if (stderr) result += `\n[stderr]\n${stderr}`

      return result || '(no output)'
    } catch (error: unknown) {
      if (error instanceof Error) {
        const execError = error as Error & { stdout?: string; stderr?: string; killed?: boolean }
        if (execError.killed) {
          return `Error: Command timed out after ${timeout}ms`
        }
        return `Error: ${execError.message}\n${execError.stderr || ''}`
      }
      return `Error: ${String(error)}`
    }
  },
}
