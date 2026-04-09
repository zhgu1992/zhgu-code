import type { Tool } from '../definitions/types/index.js'
import { BashTool } from './bash.js'
import { ReadTool } from './read.js'
import { WriteTool } from './write.js'
import { EditTool } from './edit.js'
import { GlobTool } from './glob.js'
import { GrepTool } from './grep.js'
import { WebFetchTool } from './webfetch.js'
import { WebSearchTool } from './websearch.js'
import { AskUserTool } from './askuser.js'

class ToolRegistry {
  private tools: Map<string, Tool> = new Map()

  register(tool: Tool): void {
    this.tools.set(tool.name, tool)
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name)
  }

  getAll(): Tool[] {
    return Array.from(this.tools.values())
  }

  toAPISchema(): Array<{
    name: string
    description: string
    input_schema: Tool['inputSchema']
  }> {
    return this.getAll().map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema,
    }))
  }
}

let registry: ToolRegistry | null = null

export function getTools(): ToolRegistry {
  if (registry) return registry

  registry = new ToolRegistry()

  // Register P0 tools - cast to Tool to satisfy TypeScript
  registry.register(BashTool as Tool)
  registry.register(ReadTool as Tool)
  registry.register(WriteTool as Tool)
  registry.register(EditTool as Tool)
  registry.register(GlobTool as Tool)
  registry.register(GrepTool as Tool)

  // Register P1 tools
  registry.register(WebFetchTool as Tool)
  registry.register(WebSearchTool as Tool)
  registry.register(AskUserTool as Tool)

  return registry
}
