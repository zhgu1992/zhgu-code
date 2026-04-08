import React from 'react'
import { Box, Text } from 'ink'
import type { AppStore } from '../state/store.js'
import { useStore } from 'zustand'

interface ErrorDisplayProps {
  store: AppStore
}

export function ErrorDisplay({ store }: ErrorDisplayProps) {
  const error = useStore(store, (s) => s.error)

  if (!error) return null

  const { type, message, suggestion } = parseError(error)

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="red" paddingX={1} marginBottom={1}>
      <Box marginBottom={1}>
        <Text bold color="red">
          {getErrorIcon(type)} {type}
        </Text>
      </Box>

      <Box marginBottom={1}>
        <Text>{message}</Text>
      </Box>

      {suggestion && (
        <Box>
          <Text dimColor>Suggestion: {suggestion}</Text>
        </Box>
      )}
    </Box>
  )
}

type ErrorType = 'api' | 'tool' | 'permission' | 'network' | 'unknown'

interface ParsedError {
  type: ErrorType
  message: string
  suggestion?: string
}

function parseError(error: string): ParsedError {
  // API errors
  if (error.includes('API key') || error.includes('anthropic')) {
    return {
      type: 'api',
      message: error,
      suggestion: 'Check your API key in ~/.claude/settings.json',
    }
  }

  // Permission errors
  if (error.includes('denied') || error.includes('permission')) {
    return {
      type: 'permission',
      message: error,
      suggestion: 'Try running with --ask flag to approve actions',
    }
  }

  // Network errors
  if (error.includes('network') || error.includes('ECONNREFUSED') || error.includes('ETIMEDOUT')) {
    return {
      type: 'network',
      message: error,
      suggestion: 'Check your network connection and try again',
    }
  }

  // Tool errors
  if (error.includes('Tool') || error.includes('tool')) {
    return {
      type: 'tool',
      message: error,
      suggestion: 'Check the tool parameters and try again',
    }
  }

  // Unknown errors
  return {
    type: 'unknown',
    message: error,
  }
}

function getErrorIcon(type: ErrorType): string {
  switch (type) {
    case 'api':
      return '🔑'
    case 'permission':
      return '🚫'
    case 'network':
      return '🌐'
    case 'tool':
      return '🔧'
    default:
      return '⚠️'
  }
}
