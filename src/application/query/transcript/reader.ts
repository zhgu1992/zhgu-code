import { readFile } from 'node:fs/promises'
import type { MessageContent } from '../../../definitions/types/index.js'
import {
  parseTranscriptEvent,
  type TranscriptEvent,
  type TranscriptMessageAppendEvent,
} from './model.js'

export interface TranscriptReadIssue {
  line: number
  reason: string
}

export interface TranscriptReadResult {
  events: TranscriptEvent[]
  issues: TranscriptReadIssue[]
}

export interface TranscriptToolChainLink {
  toolUseId: string
  toolUseMessageId: string
  toolResultMessageId?: string
}

export interface TranscriptTurnReplay {
  turnId: string
  input: TranscriptMessageAppendEvent[]
  toolChain: TranscriptToolChainLink[]
  output: TranscriptMessageAppendEvent[]
  partial: boolean
  gaps: string[]
}

export interface TranscriptReplay {
  turns: TranscriptTurnReplay[]
  unscopedMessages: TranscriptMessageAppendEvent[]
}

interface ReplayAccumulator {
  turnId: string
  firstSeenOrder: number
  input: TranscriptMessageAppendEvent[]
  output: TranscriptMessageAppendEvent[]
  toolChain: TranscriptToolChainLink[]
  toolChainById: Map<string, TranscriptToolChainLink>
  gaps: string[]
}

export async function readTranscriptFile(filePath: string): Promise<TranscriptReadResult> {
  const content = await readFile(filePath, 'utf8')
  return parseTranscriptJsonl(content)
}

export function parseTranscriptJsonl(content: string): TranscriptReadResult {
  const events: TranscriptEvent[] = []
  const issues: TranscriptReadIssue[] = []
  const lines = content.split(/\r?\n/)

  for (let idx = 0; idx < lines.length; idx += 1) {
    const rawLine = lines[idx]
    if (!rawLine || rawLine.trim().length === 0) {
      continue
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(rawLine)
    } catch {
      issues.push({ line: idx + 1, reason: 'invalid json' })
      continue
    }

    const result = parseTranscriptEvent(parsed)
    if (!result.ok) {
      issues.push({ line: idx + 1, reason: result.error })
      continue
    }

    events.push(result.event)
  }

  return { events, issues }
}

export function replayTranscript(events: TranscriptEvent[]): TranscriptReplay {
  const turns = new Map<string, ReplayAccumulator>()
  const unscopedMessages: TranscriptMessageAppendEvent[] = []

  for (let idx = 0; idx < events.length; idx += 1) {
    const event = events[idx]
    if (event.type !== 'message_append') {
      continue
    }

    if (!event.turn_id) {
      unscopedMessages.push(event)
      continue
    }

    let turn = turns.get(event.turn_id)
    if (!turn) {
      turn = {
        turnId: event.turn_id,
        firstSeenOrder: idx,
        input: [],
        output: [],
        toolChain: [],
        toolChainById: new Map(),
        gaps: [],
      }
      turns.set(event.turn_id, turn)
    }

    if (event.role === 'user' && !event.is_tool_result) {
      turn.input.push(event)
      continue
    }

    if (event.role === 'assistant' && !event.is_tool_result) {
      turn.output.push(event)
      continue
    }

    if (event.role === 'assistant' && event.is_tool_result) {
      const toolUseIds = extractToolUseIds(event.content)
      for (const toolUseId of toolUseIds) {
        if (turn.toolChainById.has(toolUseId)) {
          continue
        }

        const link: TranscriptToolChainLink = {
          toolUseId,
          toolUseMessageId: event.message_id,
        }
        turn.toolChain.push(link)
        turn.toolChainById.set(toolUseId, link)
      }
      continue
    }

    if (event.role === 'user' && event.is_tool_result) {
      const toolResultIds = extractToolResultIds(event.content)
      for (const toolUseId of toolResultIds) {
        const link = turn.toolChainById.get(toolUseId)
        if (!link) {
          turn.gaps.push(`tool_result_without_tool_use:${toolUseId}`)
          continue
        }
        link.toolResultMessageId = event.message_id
      }
    }
  }

  const replayTurns: TranscriptTurnReplay[] = Array.from(turns.values())
    .sort((a, b) => a.firstSeenOrder - b.firstSeenOrder)
    .map((turn) => finalizeTurn(turn))

  return {
    turns: replayTurns,
    unscopedMessages,
  }
}

function finalizeTurn(turn: ReplayAccumulator): TranscriptTurnReplay {
  const gaps = [...turn.gaps]

  for (const link of turn.toolChain) {
    if (!link.toolResultMessageId) {
      gaps.push(`missing_tool_result:${link.toolUseId}`)
    }
  }

  if (turn.input.length === 0) {
    gaps.push('missing_input')
  }
  if (turn.output.length === 0) {
    gaps.push('missing_output')
  }

  return {
    turnId: turn.turnId,
    input: turn.input,
    toolChain: turn.toolChain,
    output: turn.output,
    partial: gaps.length > 0,
    gaps,
  }
}

function extractToolUseIds(content: MessageContent): string[] {
  if (!Array.isArray(content)) {
    return []
  }

  const ids: string[] = []
  for (const block of content) {
    if (
      typeof block === 'object' &&
      block !== null &&
      'type' in block &&
      block.type === 'tool_use' &&
      'id' in block &&
      typeof block.id === 'string' &&
      block.id.length > 0
    ) {
      ids.push(block.id)
    }
  }
  return ids
}

function extractToolResultIds(content: MessageContent): string[] {
  if (!Array.isArray(content)) {
    return []
  }

  const ids: string[] = []
  for (const block of content) {
    if (
      typeof block === 'object' &&
      block !== null &&
      'type' in block &&
      block.type === 'tool_result' &&
      'tool_use_id' in block &&
      typeof block.tool_use_id === 'string' &&
      block.tool_use_id.length > 0
    ) {
      ids.push(block.tool_use_id)
    }
  }
  return ids
}
