import React from 'react'
import { Box, Text } from 'ink'
import type { AppStore } from '../state/store.js'
import { useStore } from 'zustand'

interface TokenUsageProps {
  store: AppStore
}

export function TokenUsage({ store }: TokenUsageProps) {
  const inputTokens = useStore(store, (s) => s.inputTokens)
  const outputTokens = useStore(store, (s) => s.outputTokens)

  if (inputTokens === 0 && outputTokens === 0) return null

  const total = inputTokens + outputTokens
  const inputCost = (inputTokens / 1_000_000) * 3 // $3 per million input tokens (Sonnet)
  const outputCost = (outputTokens / 1_000_000) * 15 // $15 per million output tokens (Sonnet)
  const totalCost = inputCost + outputCost

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text dimColor>
          Tokens: {formatNumber(inputTokens)} in / {formatNumber(outputTokens)} out
        </Text>
      </Box>
      {totalCost > 0.001 && (
        <Box>
          <Text dimColor>
            Est. cost: ${totalCost.toFixed(4)}
          </Text>
        </Box>
      )}
    </Box>
  )
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) {
    return (n / 1_000_000).toFixed(1) + 'M'
  }
  if (n >= 1_000) {
    return (n / 1_000).toFixed(1) + 'K'
  }
  return String(n)
}
