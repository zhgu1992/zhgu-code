import { Command } from 'commander'
import { startREPL } from '../core/repl.js'
import { VERSION } from '../definitions/constants/index.js'
import { getAPIConfig } from '../services/config.js'
import {
  buildContextView,
  buildIntegrationGraphView,
  loadLatestContextSnapshotFromTrace,
  loadLatestIntegrationGraphSnapshotEventFromTrace,
  loadLatestIntegrationGraphSnapshotFromTrace,
} from '../application/query/context-view.js'

export const program = new Command()

program
  .name('zhgu-code')
  .description('AI Coding Assistant CLI')
  .version(VERSION)

program
  .command('context')
  .description('Show latest context health snapshot from query trace')
  .action(async () => {
    const latest = await loadLatestContextSnapshotFromTrace()
    const view = buildContextView(latest)
    console.log(JSON.stringify(view, null, 2))
  })

program
  .command('integration')
  .description('Show integration snapshots from provider trace')
  .command('graph')
  .description('Show latest integration registry graph snapshot')
  .option('--latest', 'Show the latest raw integration snapshot event payload')
  .action(async (options: { latest?: boolean }) => {
    if (options.latest) {
      const latestEvent = await loadLatestIntegrationGraphSnapshotEventFromTrace()
      if (!latestEvent) {
        console.log(
          JSON.stringify(
            {
              type: 'no_data',
              reason: 'integration_graph_unavailable',
              message: 'No integration graph snapshot found in trace.',
              actions: [
                'Run `zhgu-code "<prompt>"` or start interactive REPL and execute one turn',
                'Then rerun `zhgu-code integration graph --latest`',
              ],
            },
            null,
            2,
          ),
        )
        return
      }
      console.log(JSON.stringify(latestEvent, null, 2))
      return
    }

    const latest = await loadLatestIntegrationGraphSnapshotFromTrace()
    const view = buildIntegrationGraphView(latest)
    console.log(JSON.stringify(view, null, 2))
  })

// Main command - start REPL (default)
program
  .argument('[prompt]', 'Optional prompt to send to AI')
  .option('-m, --model <model>', 'Model to use', getAPIConfig().model)
  .option('-p, --pipe', 'Pipe mode (non-interactive)', false)
  .option('-q, --quiet', 'Reduce output verbosity', false)
  .option('--auto', 'Auto-approve tool calls (default)', true)
  .option('--ask', 'Ask for approval before each tool call', false)
  .option('--plan', 'Plan mode - review plan before execution', false)
  .action(async (prompt, options) => {
    await startREPL({
      prompt,
      model: options.model,
      pipeMode: options.pipe,
      quiet: options.quiet,
      permissionMode: options.ask ? 'ask' : options.plan ? 'plan' : 'auto',
    })
  })
