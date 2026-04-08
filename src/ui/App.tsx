import React, { useState, useCallback } from 'react'
import { Box, Text } from 'ink'
import TextInput from 'ink-text-input'
import { useStore } from 'zustand'
import type { AppStore } from '../state/store.js'
import { query } from '../core/query.js'
import type { ContentBlock } from '../types.js'
import { PermissionPrompt } from './PermissionPrompt.js'
import { ProgressIndicator } from './ProgressIndicator.js'
import { ErrorDisplay } from './ErrorDisplay.js'
import { TokenUsage } from './TokenUsage.js'

interface AppProps {
  store: AppStore
}

export function App({ store }: AppProps) {
  const [input, setInput] = useState('')
  const messages = useStore(store, (s) => s.messages)
  const isStreaming = useStore(store, (s) => s.isStreaming)
  const streamingText = useStore(store, (s) => s.streamingText)
  const thinking = useStore(store, (s) => s.thinking)
  const error = useStore(store, (s) => s.error)
  const model = useStore(store, (s) => s.model)
  const pendingTool = useStore(store, (s) => s.pendingTool)

  const handleSubmit = useCallback((value: string) => {
    if (!value.trim()) return

    setInput('')

    // Add user message
    store.getState().addMessage({
      role: 'user',
      content: value,
    })

    // Use setTimeout to ensure UI updates before async operation
    setTimeout(() => {
      query(store).catch((err) => {
        store.getState().setError(err instanceof Error ? err.message : String(err))
      })
    }, 0)
  }, [store])

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
          (model: {model})
        </Text>
      </Box>

      {/* Messages - filter out tool result messages (internal use only) */}
      <Box flexDirection="column" marginBottom={1}>
        {messages
          .filter((msg) => !msg.isToolResult)
          .map((msg, i) => (
            <Box key={i} marginBottom={1} flexDirection="column">
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

      {/* Streaming indicator - show thinking or text */}
      {isStreaming && (
        <Box flexDirection="column" marginBottom={1}>
          {thinking && (
            <Box paddingLeft={1}>
              <Text dimColor italic>
                ∴ Thinking: {thinking.length > 200 ? thinking.slice(0, 200) + '...' : thinking}
              </Text>
            </Box>
          )}
          {streamingText && <Text>{streamingText}</Text>}
          {!thinking && !streamingText && <ProgressIndicator store={store} />}
        </Box>
      )}

      {/* Progress indicator for tools */}
      <ProgressIndicator store={store} />

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
    </Box>
  )
}
