import { Command } from 'commander'
import { startREPL } from '../core/repl.js'
import { VERSION } from '../definitions/constants/index.js'
import { getAPIConfig } from '../services/config.js'

export const program = new Command()

program
  .name('zhgu-code')
  .description('AI Coding Assistant CLI')
  .version(VERSION)

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
