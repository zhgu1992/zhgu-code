import React from 'react'
import { render } from 'ink'
import { App } from '../ui/App.js'
import { createStore, type AppStore } from '../state/store.js'
import { buildContext } from './context.js'
import { query } from './query.js'
import type { PermissionMode } from '../constants.js'
import { initializeObservability } from '../observability/bootstrap.js'
import { createSpanId } from '../observability/ids.js'
import { getTraceBus } from '../observability/trace-bus.js'

export interface REPLOptions {
  prompt?: string
  model: string
  pipeMode?: boolean
  quiet: boolean
  permissionMode: PermissionMode
}

export async function startREPL(options: REPLOptions): Promise<void> {
  // Initialize state store
  const store = createStore({
    model: options.model,
    permissionMode: options.permissionMode,
    quiet: options.quiet,
    cwd: process.cwd(),
  })
  const traceFilePath = initializeObservability(store)
  const traceBus = getTraceBus()
  const replSpanId = createSpanId()
  const state = store.getState()
  traceBus.emit({
    stage: 'ui',
    event: 'repl_start',
    status: 'start',
    session_id: state.sessionId,
    trace_id: state.traceId,
    span_id: replSpanId,
    payload: {
      mode: options.prompt || options.pipeMode ? 'single' : 'interactive',
      trace_file: traceFilePath,
    },
  })

  // Build initial context
  const context = await buildContext()
  store.getState().setContext(context)

  // If prompt provided, run single query (pipe mode)
  if (options.prompt || options.pipeMode) {
    await runSingleQuery(store, options.prompt || '')
    return
  }

  // Start interactive REPL
  const { waitUntilExit } = render(
    React.createElement(App, { store }),
  )

  await waitUntilExit()
  const endState = store.getState()
  traceBus.emit({
    stage: 'ui',
    event: 'repl_end',
    status: 'ok',
    session_id: endState.sessionId,
    trace_id: endState.traceId,
    span_id: replSpanId,
  })
}

async function runSingleQuery(
  store: AppStore,
  prompt: string,
): Promise<void> {
  const state = store.getState()
  state.addMessage({
    role: 'user',
    content: prompt,
  })

  try {
    await query(store)
  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  }
}
