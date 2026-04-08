import React, { useState, useCallback } from 'react'
import { Box, Text } from 'ink'
import TextInput from 'ink-text-input'
import type { AppStore, PendingTool } from '../state/store.js'
import { useStore } from 'zustand'

interface PermissionPromptProps {
  store: AppStore
}

export function PermissionPrompt({ store }: PermissionPromptProps) {
  const pendingTool = useStore(store, (s) => s.pendingTool)
  const [input, setInput] = useState('')

  const handleSubmit = useCallback(
    (value: string) => {
      const approved = value.toLowerCase() === 'y' || value.toLowerCase() === 'yes'
      store.getState().resolvePendingTool(approved)
      setInput('')
    },
    [store]
  )

  if (!pendingTool) return null

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1}>
      <Box marginBottom={1}>
        <Text bold color="yellow">
          Permission Required
        </Text>
      </Box>

      <Box marginBottom={1}>
        <Text>
          Tool: <Text bold>{pendingTool.name}</Text>
        </Text>
      </Box>

      <Box marginBottom={1} flexDirection="column">
        <Text dimColor>Input:</Text>
        <Box paddingLeft={2}>
          <Text dimColor>{formatInput(pendingTool.input)}</Text>
        </Box>
      </Box>

      <Box>
        <Text color="cyan">Allow this tool? [y/N]: </Text>
        <TextInput
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          placeholder="n"
        />
      </Box>
    </Box>
  )
}

function formatInput(input: unknown, maxLength = 200): string {
  const str = typeof input === 'string' ? input : JSON.stringify(input, null, 2)
  if (str.length > maxLength) {
    return str.slice(0, maxLength) + '...'
  }
  return str
}
