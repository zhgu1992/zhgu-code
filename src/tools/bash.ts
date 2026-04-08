import { spawn } from 'child_process'
import type { Tool, ToolContext } from '../types.js'
import type { AppStore } from '../state/store.js'

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

  async execute(input: BashInput, context: ToolContext, store?: AppStore) {
    const timeout = input.timeout || 120000

    // 更新进度的辅助函数
    const updateProgress = (progress: Partial<{
      output: string
      totalLines: number
      totalBytes: number
      elapsedTimeSeconds: number
      status: 'running' | 'completed' | 'error'
      message?: string
    }>) => {
      if (store) {
        store.getState().updateToolProgress(progress)
      }
    }

    return new Promise((resolve) => {
      let output = ''
      let startTime = Date.now()

      // 设置初始进度
      if (store) {
        store.getState().setToolProgress({
          name: 'Bash',
          status: 'running',
          startTime,
        })
      }

      const child = spawn(input.command, [], {
        shell: true,
        cwd: context.cwd,
      })

      // 设置超时
      const timer = setTimeout(() => {
        child.kill('SIGKILL')
        updateProgress({
          status: 'error',
          message: `Timed out after ${timeout}ms`,
        })
        resolve(`Error: Command timed out after ${timeout}ms\nOutput:\n${output}`)
      }, timeout)

      child.stdout?.on('data', (data: Buffer) => {
        const chunk = data.toString()
        output += chunk

        // 实时更新进度
        const lines = output.split('\n').filter(l => l.trim()).length
        const elapsed = Math.round((Date.now() - startTime) / 1000)
        updateProgress({
          output: chunk,
          totalLines: lines,
          totalBytes: output.length,
          elapsedTimeSeconds: elapsed,
        })
      })

      child.stderr?.on('data', (data: Buffer) => {
        const chunk = data.toString()
        output += `\n[stderr]\n${chunk}`

        const lines = output.split('\n').filter(l => l.trim()).length
        const elapsed = Math.round((Date.now() - startTime) / 1000)
        updateProgress({
          output: chunk,
          totalLines: lines,
          totalBytes: output.length,
          elapsedTimeSeconds: elapsed,
        })
      })

      child.on('close', (code) => {
        clearTimeout(timer)
        const elapsed = Math.round((Date.now() - startTime) / 1000)

        if (store) {
          store.getState().setToolProgress({
            name: 'Bash',
            status: code === 0 ? 'completed' : 'error',
            startTime,
            output: output.slice(-500), // 保留最后 500 字符
            totalLines: output.split('\n').filter(l => l.trim()).length,
            totalBytes: output.length,
            elapsedTimeSeconds: elapsed,
            message: code === 0 ? `done (${elapsed}s)` : `exit ${code}`,
          })
        }

        if (code === 0) {
          resolve(output || '(no output)')
        } else {
          resolve(`Exit code: ${code}\n${output}`)
        }
      })

      child.on('error', (error) => {
        clearTimeout(timer)

        if (store) {
          store.getState().setToolProgress({
            name: 'Bash',
            status: 'error',
            startTime,
            message: error.message,
          })
        }

        resolve(`Error: ${error.message}`)
      })
    })
  },
}