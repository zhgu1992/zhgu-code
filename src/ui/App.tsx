import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { Box, Text } from 'ink'
import { useInput } from 'ink'
import TextInput from 'ink-text-input'
import { useStore } from 'zustand'
import type { AppStore } from '../state/store.js'
import { query } from '../core/query.js'
import type { ContentBlock } from '../definitions/types/index.js'
import { PermissionPrompt } from './PermissionPrompt.js'
import { Spinner } from './Spinner.js'
import { ErrorDisplay } from './ErrorDisplay.js'
import { TokenUsage } from './TokenUsage.js'
import {
  executeModeCommand,
  getModeCommandDefinitions,
  type ModeCommandDefinition,
} from '../core/commands/mode-command.js'

interface AppProps {
  store: AppStore
}

export function App({ store }: AppProps) {
  const [input, setInput] = useState('')
  const [selectedSlashIndex, setSelectedSlashIndex] = useState(0)
  const suppressNextSubmitRef = useRef(false)
  const messages = useStore(store, (s) => s.messages)
  const isStreaming = useStore(store, (s) => s.isStreaming)
  const streamingText = useStore(store, (s) => s.streamingText)
  const thinking = useStore(store, (s) => s.thinking)
  const error = useStore(store, (s) => s.error)
  const model = useStore(store, (s) => s.model)
  const pendingTool = useStore(store, (s) => s.pendingTool)
  const permissionMode = useStore(store, (s) => s.permissionMode)
  const modeCommands = useMemo(() => getModeCommandDefinitions(), [])

  const formatCommandListMessage = useCallback((commands: ModeCommandDefinition[]) => {
    const lines = commands.map((item) => `${item.usage} - ${item.description}`)
    return ['Available commands:', ...lines].join('\n')
  }, [])

  const slashSuggestions = useMemo(() => {
    const trimmed = input.trim()
    if (!trimmed.startsWith('/')) {
      return []
    }
    if (trimmed === '/') {
      return modeCommands
    }
    if (trimmed.includes(' ')) {
      return []
    }
    return modeCommands.filter((item) => item.command.startsWith(trimmed.toLowerCase()))
  }, [input, modeCommands])

  useEffect(() => {
    if (slashSuggestions.length === 0) {
      setSelectedSlashIndex(0)
      return
    }
    setSelectedSlashIndex((prev) =>
      Math.min(Math.max(prev, 0), slashSuggestions.length - 1),
    )
  }, [slashSuggestions])

  const submitResolvedInput = useCallback((value: string) => {
    const trimmed = value.trim()
    setInput('')

    if (trimmed === '/') {
      store.getState().addMessage({
        role: 'assistant',
        content: formatCommandListMessage(modeCommands),
      })
      return
    }

    const modeCommandResult = executeModeCommand(store, trimmed)
    if (modeCommandResult.handled) {
      if (modeCommandResult.message) {
        store.getState().addMessage({
          role: 'assistant',
          content: modeCommandResult.message,
        })
      }
      return
    }

    if (trimmed.startsWith('/')) {
      store.getState().addMessage({
        role: 'assistant',
        content: `Unknown command: ${trimmed}\n${formatCommandListMessage(modeCommands)}`,
      })
      return
    }

    store.getState().addMessage({
      role: 'user',
      content: trimmed,
    })

    void query(store, { emitStdout: false }).catch((err) => {
      store.getState().setError(err instanceof Error ? err.message : String(err))
    })
  }, [store, formatCommandListMessage, modeCommands])

  const handleSubmit = useCallback((value: string) => {
    if (!value.trim()) return
    if (store.getState().isStreaming) return
    if (suppressNextSubmitRef.current) {
      suppressNextSubmitRef.current = false
      return
    }

    submitResolvedInput(value)
  }, [store, submitResolvedInput])

  useInput((_input, key) => {
    if (store.getState().isStreaming) return
    if (slashSuggestions.length === 0) return

    if (key.upArrow) {
      setSelectedSlashIndex((prev) =>
        prev <= 0 ? slashSuggestions.length - 1 : prev - 1,
      )
      return
    }

    if (key.downArrow) {
      setSelectedSlashIndex((prev) =>
        prev >= slashSuggestions.length - 1 ? 0 : prev + 1,
      )
      return
    }

    if (key.return) {
      const selected = slashSuggestions[selectedSlashIndex] ?? slashSuggestions[0]
      if (!selected) return
      suppressNextSubmitRef.current = true
      submitResolvedInput(selected.usage)
    }
  })

  const renderContent = (content: string | ContentBlock[]) => {
    if (typeof content === 'string') {
      return <Text>{content}</Text>
    }

    return (
      <Box flexDirection="column">
        {content.map((block, idx) => {
          switch (block.type) {
            case 'thinking':
              return (
                <Box key={idx} paddingLeft={1} marginBottom={1}>
                  <Text dimColor italic>
                    ∴ {block.thinking}
                  </Text>
                </Box>
              )
            case 'text':
              return <Text key={idx}>{block.text}</Text>
            case 'tool_use':
              return (
                <Text key={idx} dimColor>
                  {' '}
                  [Tool: {block.name}]
                </Text>
              )
            case 'tool_result':
              return <Text key={idx}>{block.content}</Text>
            default:
              return null
          }
        })}
      </Box>
    )
  }

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          zhgu-code
        </Text>
        <Text dimColor>
          {' '}
          (model: {model}, mode: {permissionMode})
        </Text>
      </Box>

      {/* Messages - filter out tool result messages (internal use only) */}
      <Box flexDirection="column" marginBottom={1}>
        {messages
          .filter((msg) => !msg.isToolResult)
          .map((msg, i) => (
            <Box key={msg.id ?? `msg-${i}`} marginBottom={1} flexDirection="column">
              <Text
                bold
                color={msg.role === 'user' ? 'green' : msg.role === 'assistant' ? 'blue' : 'gray'}
              >
                {msg.role === 'user' ? 'You' : 'Assistant'}:{' '}
              </Text>
              <Box paddingLeft={2}>{renderContent(msg.content)}</Box>
            </Box>
          ))}
      </Box>

      {/* Streaming assistant message */}
      {isStreaming && (
        <Box marginBottom={1} flexDirection="column">
          <Text bold color="blue">
            Assistant:{' '}
          </Text>
          <Box paddingLeft={2} flexDirection="column">
            {thinking && (
              <Text dimColor italic>
                ∴ Thinking: {thinking.length > 200 ? thinking.slice(0, 200) + '...' : thinking}
              </Text>
            )}
            {streamingText && <Text>{streamingText}</Text>}
            {!thinking && !streamingText && (
              <Text dimColor>…</Text>
            )}
          </Box>
        </Box>
      )}

      {/* Spinner for streaming and tool progress */}
      <Spinner store={store} />

      {/* Error display */}
      <ErrorDisplay store={store} />

      {/* Permission prompt */}
      <PermissionPrompt store={store} />

      {/* Token usage */}
      <TokenUsage store={store} />

      {/* Input */}
      <Box>
        <Text bold color="green">
          ❯{' '}
        </Text>
        <TextInput
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          placeholder={pendingTool ? 'Answer permission prompt above' : 'Type your message...'}
        />
      </Box>
      {slashSuggestions.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          {slashSuggestions.map((item, idx) => (
            <Text key={item.command} color={idx === selectedSlashIndex ? 'cyan' : undefined} dimColor={idx !== selectedSlashIndex}>
              {idx === selectedSlashIndex ? '› ' : '  '}
              {item.usage} - {item.description}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  )
}
