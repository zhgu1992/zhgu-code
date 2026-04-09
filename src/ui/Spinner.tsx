import React, { useState, useEffect, useRef, useMemo } from 'react'
import { Box, Text } from 'ink'
import { useStore } from 'zustand'
import type { AppStore, ToolProgress } from '../state/store.js'
import {
  SPINNER_VERBS,
  SPINNER_FRAMES,
  STALL_THRESHOLD_MS,
  STALL_FADE_DURATION_MS,
} from '../constants/spinnerVerbs.js'

interface SpinnerProps {
  store: AppStore
}

// Format duration as mm:ss or ss
function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes > 0) {
    return `${minutes}m${seconds.toString().padStart(2, '0')}s`
  }
  return `${seconds}s`
}

// Format number with K/M suffix
function formatNumber(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1)}M`
  }
  if (n >= 1_000) {
    return `${(n / 1_000).toFixed(1)}K`
  }
  return n.toString()
}

// Pick a random verb
function getRandomVerb(): string {
  return SPINNER_VERBS[Math.floor(Math.random() * SPINNER_VERBS.length)]
}

export function Spinner({ store }: SpinnerProps) {
  const isStreaming = useStore(store, (s) => s.isStreaming)
  const toolProgress = useStore(store, (s) => s.toolProgress)
  const thinking = useStore(store, (s) => s.thinking)
  const streamingText = useStore(store, (s) => s.streamingText)
  const outputTokens = useStore(store, (s) => s.outputTokens)

  // Animation state
  const [frame, setFrame] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [toolElapsed, setToolElapsed] = useState(0)
  const [verb] = useState(() => getRandomVerb())

  // Track streaming start time and last activity
  const startTimeRef = useRef<number | null>(null)
  const lastActivityRef = useRef<number>(0)

  // Update activity tracking
  useEffect(() => {
    if (streamingText || thinking) {
      lastActivityRef.current = Date.now()
    }
  }, [streamingText, thinking])

  // Animation loop
  useEffect(() => {
    if (!isStreaming) {
      startTimeRef.current = null
      return
    }

    // Initialize start time
    if (startTimeRef.current === null) {
      startTimeRef.current = Date.now()
      lastActivityRef.current = Date.now()
    }

    const interval = setInterval(() => {
      // Update frame
      setFrame((f) => (f + 1) % SPINNER_FRAMES.length)

      // Update elapsed time
      if (startTimeRef.current) {
        setElapsed(Date.now() - startTimeRef.current)
      }

      // Update tool elapsed time if tool is running
      if (toolProgress?.startTime) {
        setToolElapsed(Date.now() - toolProgress.startTime)
      }
    }, 80) // 80ms per frame for smooth animation

    return () => clearInterval(interval)
  }, [isStreaming, toolProgress])

  // Calculate stalled intensity
  const stalledIntensity = useMemo(() => {
    if (!isStreaming || !startTimeRef.current) return 0
    const timeSinceActivity = Date.now() - lastActivityRef.current
    if (timeSinceActivity < STALL_THRESHOLD_MS) return 0
    return Math.min((timeSinceActivity - STALL_THRESHOLD_MS) / STALL_FADE_DURATION_MS, 1)
  }, [isStreaming, elapsed])

  // Don't render if not streaming
  if (!isStreaming) return null

  // Tool progress display (when tool is running)
  if (toolProgress && toolProgress.status === 'running') {
    const duration = formatDuration(toolElapsed)
    return (
      <Box flexDirection="column" marginTop={1}>
        <Box flexDirection="row">
          <Text color="cyan">{SPINNER_FRAMES[frame]} </Text>
          <Text color="cyan" bold>
            {toolProgress.name}…
          </Text>
          <Text dimColor>
            {' '}
            ({duration})
          </Text>
        </Box>
        {toolProgress.message && (
          <Box paddingLeft={2}>
            <Text dimColor>{toolProgress.message}</Text>
          </Box>
        )}
      </Box>
    )
  }

  // Main spinner display (API call in progress)
  const spinnerChar = SPINNER_FRAMES[frame]
  const duration = formatDuration(elapsed)

  // Token count (estimate from text length)
  const tokenCount = Math.round((streamingText?.length || 0) / 4) + outputTokens

  // Determine color based on stalled state
  const spinnerColor = stalledIntensity > 0.5 ? 'red' : stalledIntensity > 0 ? 'yellow' : 'cyan'

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box flexDirection="row">
        {/* Spinner glyph */}
        <Text color={spinnerColor}>{spinnerChar} </Text>

        {/* Verb */}
        <Text color="cyan" bold>
          {verb}…
        </Text>

        {/* Duration and token count */}
        <Text dimColor>
          {' '}
          ({duration}
          {tokenCount > 0 && (
            <>
              {' '}
              · ↓ {formatNumber(tokenCount)} tokens
            </>
          )}
          )
        </Text>
      </Box>

    </Box>
  )
}
