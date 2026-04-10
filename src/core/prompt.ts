import type { Context } from './context.js'
import type { MessageParams, SystemPromptBlock } from '../definitions/types/index.js'

export interface BuildSystemPromptOptions {
  enableCachePrefixStrategy?: boolean
}

export interface SystemPromptSections {
  staticFoundation: string
  stableProjectContext: string
  dynamicRuntimeContext: string
}

export interface BuiltSystemPrompt {
  system: MessageParams['system']
  legacy: string
  sections: SystemPromptSections
}

const CACHE_CONTROL_EPHEMERAL = { type: 'ephemeral' } as const

export function buildSystemPrompt(
  context: Context,
  options: BuildSystemPromptOptions = {},
): BuiltSystemPrompt {
  const legacy = buildLegacySystemPrompt(context)
  const sections = buildSystemPromptSections(context)
  const enableCachePrefixStrategy = options.enableCachePrefixStrategy ?? true

  if (!enableCachePrefixStrategy) {
    return {
      system: legacy,
      legacy,
      sections,
    }
  }

  const blocks: SystemPromptBlock[] = []

  if (sections.staticFoundation) {
    blocks.push({
      type: 'text',
      text: sections.staticFoundation,
      cache_control: CACHE_CONTROL_EPHEMERAL,
    })
  }
  if (sections.stableProjectContext) {
    blocks.push({
      type: 'text',
      text: sections.stableProjectContext,
      cache_control: CACHE_CONTROL_EPHEMERAL,
    })
  }
  if (sections.dynamicRuntimeContext) {
    blocks.push({
      type: 'text',
      text: sections.dynamicRuntimeContext,
    })
  }

  return {
    system: blocks.length > 0 ? blocks : legacy,
    legacy,
    sections,
  }
}

function buildSystemPromptSections(context: Context): SystemPromptSections {
  const staticFoundationParts: string[] = []
  const stableProjectContextParts: string[] = []
  const dynamicRuntimeParts: string[] = []

  staticFoundationParts.push('You are zhgu-code, an AI coding assistant.')
  staticFoundationParts.push(`Platform: ${context.systemInfo.platform}`)
  staticFoundationParts.push(`Node version: ${context.systemInfo.nodeVersion}`)

  if (context.memoryFiles && context.memoryFiles.length > 0) {
    stableProjectContextParts.push(`\n# Memory\n\n${context.memoryFiles.join('\n\n---\n\n')}`)
  }
  if (context.claudeMd) {
    stableProjectContextParts.push(`\n# Project Context (CLAUDE.md)\n\n${context.claudeMd}`)
  }

  dynamicRuntimeParts.push(`Current date: ${context.systemInfo.date}`)
  dynamicRuntimeParts.push(`Working directory: ${context.cwd}`)
  if (context.gitBranch) {
    dynamicRuntimeParts.push(`Current git branch: ${context.gitBranch}`)
  }
  if (context.gitStatus) {
    dynamicRuntimeParts.push(`Current git status:\n${context.gitStatus}`)
  }

  return {
    staticFoundation: staticFoundationParts.join('\n'),
    stableProjectContext: stableProjectContextParts.join('\n\n').trim(),
    dynamicRuntimeContext: dynamicRuntimeParts.join('\n'),
  }
}

function buildLegacySystemPrompt(context: Context): string {
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
