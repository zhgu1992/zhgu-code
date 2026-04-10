#!/usr/bin/env bun
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import {
  readTranscriptFile,
  replayTranscript,
  type TranscriptEvent,
  type TranscriptMessageAppendEvent,
  type TranscriptTurnReplay,
} from '../src/application/query/transcript/reader.js'
import type { MessageContent } from '../src/definitions/types/index.js'

const args = process.argv.slice(2)
const jsonOutput = args.includes('--json')
const showUnscoped = args.includes('--show-unscoped')
const engineTurnsOnly = args.includes('--engine-turns')
const fullOutput = args.includes('--full')
const latestOnly = args.includes('--latest')
const readableOutput = args.includes('--readable')
const turnIdFilter = getFlagValue(args, '--turn')
const outputFile = getFlagValue(args, '--file')
const outputPath = outputFile ? resolve(process.cwd(), outputFile) : null
const positional = getPositionalArgs(args, new Set(['--turn', '--file']))
const previewLimit = fullOutput ? Number.MAX_SAFE_INTEGER : 220
const outputChunks: string[] = []

const transcriptPath = resolve(
  process.cwd(),
  positional[0] || process.env.ZHGU_TRANSCRIPT_FILE || '.trace/transcript.jsonl',
)

async function main(): Promise<void> {
  const { events: allEvents, issues } = await readTranscriptFile(transcriptPath)
  const latestSessionId = latestOnly ? detectLatestSessionId(allEvents) : null
  const events = latestSessionId
    ? allEvents.filter((event) => event.session_id === latestSessionId)
    : allEvents

  const engineReplay = replayTranscript(events)
  const engineTurns = turnIdFilter
    ? engineReplay.turns.filter((turn) => turnIdMatches(turn.turnId, turnIdFilter))
    : engineReplay.turns
  const conversations = buildConversationReplay(events)
  const filteredConversations = turnIdFilter
    ? conversations.filter((item) =>
      Array.from(item.turnIds).some((turnId) => turnIdMatches(turnId, turnIdFilter))
    )
    : conversations

  if (jsonOutput) {
    const messageById = buildMessageIndex(events)
    const conversationsJson = filteredConversations.map((item) => ({
      index: item.index,
      ...(readableOutput ? {} : { turn_ids: Array.from(item.turnIds) }),
      user_inputs: item.userInputs,
      tool_calls: item.tools.map((tool) => ({
        name: tool.name,
        input: tool.input,
        result: tool.result,
        result_found: tool.resultFound,
        ...(readableOutput
          ? {}
          : {
            tool_use_id: tool.toolUseId,
            turn_id: tool.turnId,
          }),
      })),
      assistant_outputs: item.assistantOutputs,
      has_user_input: item.hasUserInput,
      orphan_tool_results: item.orphanToolResults,
    }))

    writeOut(
      `${JSON.stringify(
        {
          path: transcriptPath,
          event_count: events.length,
          source_event_count: allEvents.length,
          latest_only: latestOnly,
          session_id: latestSessionId,
          issue_count: issues.length,
          issues,
          conversation_count: filteredConversations.length,
          conversations: conversationsJson,
          engine_turn_count: engineTurns.length,
          engine_turns: readableOutput
            ? buildReadableEngineTurns(engineTurns, messageById)
            : engineTurns,
          unscoped_count: engineReplay.unscopedMessages.length,
        },
        null,
        2,
      )}\n`,
    )
    await flushOutput()
    return
  }

  writeOut(`transcript: ${transcriptPath}\n`)
  if (latestSessionId) {
    writeOut(`session: ${latestSessionId} (latest)\n`)
  } else if (latestOnly) {
    writeOut('session: (latest not found, fallback to all events)\n')
  }
  writeOut(`events: ${events.length} | parse_issues: ${issues.length}\n`)
  if (issues.length > 0) {
    for (const issue of issues) {
      writeOut(`  - line ${issue.line}: ${issue.reason}\n`)
    }
  }

  if (engineTurnsOnly) {
    writeOut(`engine_turns: ${engineTurns.length}\n`)
    for (const turn of engineTurns) {
      printEngineTurn(turn)
    }
  } else {
    writeOut(`conversation_turns: ${filteredConversations.length}\n`)
    for (const item of filteredConversations) {
      printConversationTurn(item)
    }
  }

  if (showUnscoped && engineReplay.unscopedMessages.length > 0) {
    writeOut(`\nunscoped_messages: ${engineReplay.unscopedMessages.length}\n`)
    for (const message of engineReplay.unscopedMessages) {
      writeOut(
        `  - ${message.message_id} role=${message.role} tool_result=${message.is_tool_result}\n`,
      )
    }
  }

  await flushOutput()
}

function printEngineTurn(turn: TranscriptTurnReplay): void {
  writeOut(`\n[turn ${shorten(turn.turnId)}]\n`)
  writeOut(`  input=${turn.input.length}\n`)
  writeOut(`  tool_chain=${turn.toolChain.length}\n`)
  for (const link of turn.toolChain) {
    writeOut(
      `    - tool_use_id=${link.toolUseId} result=${link.toolResultMessageId ? 'ok' : 'missing'}\n`,
    )
  }
  writeOut(`  output=${turn.output.length}\n`)
  writeOut(`  partial=${turn.partial}\n`)
  if (turn.gaps.length > 0) {
    writeOut(`  gaps=${turn.gaps.join(', ')}\n`)
  }
}

type ConversationToolCall = {
  toolUseId: string
  name: string
  input: string
  result: string
  resultFound: boolean
  turnId?: string
}

type ConversationReplayTurn = {
  index: number
  turnIds: Set<string>
  userInputs: string[]
  tools: ConversationToolCall[]
  toolById: Map<string, ConversationToolCall>
  assistantOutputs: string[]
  hasUserInput: boolean
  orphanToolResults: string[]
}

type ReadableEngineToolLink = {
  name: string
  input: string
  result: string
  result_found: boolean
}

type ReadableEngineTurn = {
  index: number
  input: string[]
  tool_chain: ReadableEngineToolLink[]
  output: string[]
  partial: boolean
  gaps: string[]
}

function buildConversationReplay(
  events: TranscriptEvent[],
): ConversationReplayTurn[] {
  const messageEvents = events.filter(
    (event): event is TranscriptMessageAppendEvent => event.type === 'message_append',
  )
  const replay: ConversationReplayTurn[] = []
  let current: ConversationReplayTurn | null = null

  for (const event of messageEvents) {
    const isVisibleUserInput = event.role === 'user' && event.is_tool_result === false

    if (isVisibleUserInput) {
      if (current && hasConversationData(current)) {
        replay.push(current)
      }
      current = createConversationTurn(replay.length + 1)
      current.hasUserInput = true
      if (event.turn_id) {
        current.turnIds.add(event.turn_id)
      }
      current.userInputs.push(contentPreview(event.content))
      continue
    }

    if (!current) {
      current = createConversationTurn(replay.length + 1)
    }
    if (event.turn_id) {
      current.turnIds.add(event.turn_id)
    }

    if (event.role === 'assistant' && event.is_tool_result === false) {
      current.assistantOutputs.push(contentPreview(event.content))
      continue
    }

    if (event.role === 'assistant' && event.is_tool_result === true) {
      for (const block of getBlocks(event.content)) {
        if (block.type !== 'tool_use') {
          continue
        }

        const toolUseId = getStringValue(block, 'id')
        const toolName = getStringValue(block, 'name')
        if (!toolUseId || !toolName) {
          continue
        }

        const existing = current.toolById.get(toolUseId)
        if (existing) {
          continue
        }

        const tool: ConversationToolCall = {
          toolUseId,
          name: toolName,
          input: jsonPreview(block.input),
          result: '(pending)',
          resultFound: false,
          turnId: event.turn_id,
        }
        current.tools.push(tool)
        current.toolById.set(toolUseId, tool)
      }
      continue
    }

    if (event.role === 'user' && event.is_tool_result === true) {
      for (const block of getBlocks(event.content)) {
        if (block.type !== 'tool_result') {
          continue
        }

        const toolUseId = getStringValue(block, 'tool_use_id')
        if (!toolUseId) {
          continue
        }

        const resultText = toolResultContentPreview(block.content)
        const target = current.toolById.get(toolUseId)
        if (!target) {
          current.orphanToolResults.push(`${toolUseId}: ${resultText}`)
          continue
        }

        target.result = resultText
        target.resultFound = true
      }
    }
  }

  if (current && hasConversationData(current)) {
    replay.push(current)
  }

  return replay
}

function buildReadableEngineTurns(
  turns: TranscriptTurnReplay[],
  messageById: Map<string, TranscriptMessageAppendEvent>,
): ReadableEngineTurn[] {
  return turns.map((turn, index) => ({
    index: index + 1,
    input: turn.input.map((item) => contentPreview(item.content)),
    tool_chain: turn.toolChain.map((link) => {
      const toolUseEvent = messageById.get(link.toolUseMessageId)
      const useBlock = toolUseEvent ? findToolUseBlock(toolUseEvent.content, link.toolUseId) : null
      const toolResultEvent = link.toolResultMessageId
        ? messageById.get(link.toolResultMessageId)
        : null
      const resultBlock = toolResultEvent
        ? findToolResultBlock(toolResultEvent.content, link.toolUseId)
        : null

      return {
        name: getStringValue(useBlock ?? {}, 'name') || '(unknown)',
        input: useBlock ? jsonPreview(useBlock.input) : '(missing)',
        result: resultBlock ? toolResultContentPreview(resultBlock.content) : '(missing)',
        result_found: Boolean(resultBlock),
      }
    }),
    output: turn.output.map((item) => contentPreview(item.content)),
    partial: turn.partial,
    gaps: turn.gaps,
  }))
}

function buildMessageIndex(events: TranscriptEvent[]): Map<string, TranscriptMessageAppendEvent> {
  const messageById = new Map<string, TranscriptMessageAppendEvent>()
  for (const event of events) {
    if (event.type !== 'message_append') {
      continue
    }
    messageById.set(event.message_id, event)
  }
  return messageById
}

function findToolUseBlock(
  content: MessageContent,
  toolUseId: string,
): Record<string, unknown> | null {
  for (const block of getBlocks(content)) {
    if (block.type !== 'tool_use') {
      continue
    }
    if (getStringValue(block, 'id') === toolUseId) {
      return block
    }
  }
  return null
}

function findToolResultBlock(
  content: MessageContent,
  toolUseId: string,
): Record<string, unknown> | null {
  for (const block of getBlocks(content)) {
    if (block.type !== 'tool_result') {
      continue
    }
    if (getStringValue(block, 'tool_use_id') === toolUseId) {
      return block
    }
  }
  return null
}

function printConversationTurn(turn: ConversationReplayTurn): void {
  writeOut(`\n[conversation ${turn.index}]\n`)
  writeOut(
    `  turn_ids=${turn.turnIds.size > 0 ? Array.from(turn.turnIds).map(shorten).join(', ') : '(none)'}\n`,
  )

  writeOut('  user_input:\n')
  if (turn.userInputs.length === 0) {
    writeOut('    - (missing)\n')
  } else {
    for (const input of turn.userInputs) {
      writeOut(`    - ${input}\n`)
    }
  }

  writeOut('  tool_calls:\n')
  if (turn.tools.length === 0) {
    writeOut('    - (none)\n')
  } else {
    for (const tool of turn.tools) {
      writeOut(`    - ${tool.name} id=${tool.toolUseId}\n`)
      writeOut(`      input: ${tool.input}\n`)
      writeOut(`      result: ${tool.result}\n`)
    }
  }

  if (turn.orphanToolResults.length > 0) {
    writeOut('  orphan_tool_results:\n')
    for (const orphan of turn.orphanToolResults) {
      writeOut(`    - ${orphan}\n`)
    }
  }

  writeOut('  assistant_output:\n')
  if (turn.assistantOutputs.length === 0) {
    writeOut('    - (missing)\n')
  } else {
    for (const output of turn.assistantOutputs) {
      writeOut(`    - ${output}\n`)
    }
  }
}

function createConversationTurn(index: number): ConversationReplayTurn {
  return {
    index,
    turnIds: new Set(),
    userInputs: [],
    tools: [],
    toolById: new Map(),
    assistantOutputs: [],
    hasUserInput: false,
    orphanToolResults: [],
  }
}

function hasConversationData(turn: ConversationReplayTurn): boolean {
  return turn.userInputs.length > 0
    || turn.assistantOutputs.length > 0
    || turn.tools.length > 0
    || turn.orphanToolResults.length > 0
}

function getBlocks(content: MessageContent): Array<Record<string, unknown>> {
  if (!Array.isArray(content)) {
    return []
  }
  return content.filter(
    (item): item is Record<string, unknown> => typeof item === 'object' && item !== null,
  )
}

function getStringValue(record: Record<string, unknown>, key: string): string | null {
  const value = record[key]
  if (typeof value !== 'string' || value.length === 0) {
    return null
  }
  return value
}

function contentPreview(content: MessageContent): string {
  if (typeof content === 'string') {
    return oneLine(content)
  }

  const chunks: string[] = []
  for (const block of getBlocks(content)) {
    const blockType = getStringValue(block, 'type')
    if (!blockType) {
      continue
    }

    if (blockType === 'text') {
      const text = getStringValue(block, 'text')
      if (text) {
        chunks.push(oneLine(text))
      }
      continue
    }

    if (blockType === 'thinking') {
      const thinking = getStringValue(block, 'thinking')
      if (thinking) {
        chunks.push(`[thinking] ${oneLine(thinking)}`)
      }
      continue
    }

    if (blockType === 'tool_use') {
      const name = getStringValue(block, 'name') || 'unknown'
      const id = getStringValue(block, 'id') || 'unknown'
      chunks.push(`[tool_use] ${name}#${id}`)
      continue
    }

    if (blockType === 'tool_result') {
      const id = getStringValue(block, 'tool_use_id') || 'unknown'
      const result = toolResultContentPreview(block.content)
      chunks.push(`[tool_result] ${id}: ${result}`)
      continue
    }

    chunks.push(`[${blockType}]`)
  }

  if (chunks.length === 0) {
    return '(empty)'
  }
  return truncate(oneLine(chunks.join(' | ')), previewLimit)
}

function toolResultContentPreview(content: unknown): string {
  if (typeof content === 'string') {
    return truncate(oneLine(content), previewLimit)
  }

  if (Array.isArray(content)) {
    const parts = content
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .map((item) => {
        const text = item.text
        if (typeof text === 'string') {
          return oneLine(text)
        }
        return jsonPreview(item)
      })
      .filter(Boolean)

    if (parts.length > 0) {
      return truncate(parts.join(' | '), previewLimit)
    }
  }

  return jsonPreview(content)
}

function jsonPreview(value: unknown): string {
  try {
    return truncate(oneLine(JSON.stringify(value)), previewLimit)
  } catch {
    return '(unserializable)'
  }
}

function oneLine(input: string): string {
  return input.replace(/\s+/g, ' ').trim()
}

function getFlagValue(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag)
  if (index >= 0 && argv[index + 1]) {
    return argv[index + 1]
  }
  return undefined
}

function getPositionalArgs(argv: string[], flagsWithValue: Set<string>): string[] {
  const result: string[] = []
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index]
    if (!current) {
      continue
    }
    if (flagsWithValue.has(current)) {
      index += 1
      continue
    }
    if (current.startsWith('-')) {
      continue
    }
    result.push(current)
  }
  return result
}

function shorten(id: string): string {
  return id.length > 12 ? id.slice(-12) : id
}

function truncate(input: string, maxLen: number): string {
  if (input.length <= maxLen) {
    return input
  }
  return `${input.slice(0, maxLen)}...`
}

function turnIdMatches(actualTurnId: string, query: string): boolean {
  return actualTurnId === query || actualTurnId.endsWith(query)
}

function writeOut(chunk: string): void {
  outputChunks.push(chunk)
  if (!outputPath) {
    process.stdout.write(chunk)
  }
}

async function flushOutput(): Promise<void> {
  if (!outputPath) {
    return
  }
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, outputChunks.join(''), 'utf8')
  process.stdout.write(`[transcript:replay] wrote output to ${outputPath}\n`)
}

function detectLatestSessionId(events: TranscriptEvent[]): string | null {
  let latestFromSessionStart: string | null = null
  let latestFromAnyEvent: string | null = null

  for (const event of events) {
    latestFromAnyEvent = event.session_id
    if (event.type === 'session_start') {
      latestFromSessionStart = event.session_id
    }
  }

  return latestFromSessionStart || latestFromAnyEvent
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`[transcript:replay] failed: ${message}\n`)
  process.exit(1)
})
