import React, { useState, useEffect } from 'react'
import { Box, Text } from 'ink'
import type { AppStore, ToolProgress } from '../state/store.js'
import { useStore } from 'zustand'

interface ProgressIndicatorProps {
  store: AppStore
}

export function ProgressIndicator({ store }: ProgressIndicatorProps) {
  const toolProgress = useStore(store, (s) => s.toolProgress)
  const isStreaming = useStore(store, (s) => s.isStreaming)

  if (!toolProgress && !isStreaming) return null

  return (
    <Box flexDirection="column" marginBottom={1}>
      {toolProgress && <ToolProgressDisplay progress={toolProgress} />}
      {isStreaming && !toolProgress && <StreamingIndicator />}
    </Box>
  )
}

function ToolProgressDisplay({ progress }: { progress: ToolProgress }) {
  const elapsed = Math.round((Date.now() - progress.startTime) / 1000)
  const statusIcon = getStatusIcon(progress.status)
  const statusColor = getStatusColor(progress.status)

  return (
    <Box>
      <Text color={statusColor}>
        {statusIcon} {progress.name}
      </Text>
      {progress.message && (
        <Text dimColor>
          {' '}
          - {progress.message}
        </Text>
      )}
      <Text dimColor>
        {' '}
        ({elapsed}s)
      </Text>
    </Box>
  )
}

function StreamingIndicator() {
  const [frame, setFrame] = useState(0)
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((f) => (f + 1) % frames.length)
    }, 80)
    return () => clearInterval(timer)
  }, [])

  return (
    <Box>
      <Text color="cyan">{frames[frame]}</Text>
      <Text dimColor> Processing...</Text>
    </Box>
  )
}

function getStatusIcon(status: ToolProgress['status']): string {
  switch (status) {
    case 'pending':
      return '⏳'
    case 'running':
      return '🔄'
    case 'completed':
      return '✅'
    case 'error':
      return '❌'
    default:
      return '❓'
  }
}

function getStatusColor(status: ToolProgress['status']): string {
  switch (status) {
    case 'pending':
      return 'yellow'
    case 'running':
      return 'cyan'
    case 'completed':
      return 'green'
    case 'error':
      return 'red'
    default:
      return 'white'
  }
}
