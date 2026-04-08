import type { Context } from './context.js'

export function buildSystemPrompt(context: Context): string {
  const parts: string[] = []

  // System info
  parts.push(`You are zhgu-code, an AI coding assistant.

Current date: ${context.systemInfo.date}
Platform: ${context.systemInfo.platform}
Working directory: ${context.cwd}`)

  // Git info
  if (context.gitBranch) {
    parts.push(`Current git branch: ${context.gitBranch}`)
  }

  // Memory files (user preferences, past learnings)
  if (context.memoryFiles && context.memoryFiles.length > 0) {
    parts.push(`\n# Memory\n\n${context.memoryFiles.join('\n\n---\n\n')}`)
  }

  // CLAUDE.md content
  if (context.claudeMd) {
    parts.push(`\n# Project Context (CLAUDE.md)\n\n${context.claudeMd}`)
  }

  return parts.join('\n\n')
}
