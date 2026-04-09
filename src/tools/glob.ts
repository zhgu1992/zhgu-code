import * as fs from 'fs'
import * as path from 'path'
import type { Tool } from '../definitions/types/index.js'

interface GlobInput {
  pattern: string
  path?: string
}

export const GlobTool: Tool<GlobInput, string> = {
  name: 'Glob',
  description:
    'Find files matching a glob pattern. Returns a list of matching file paths sorted by modification time.',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'The glob pattern to match files against (e.g., "**/*.ts")',
      },
      path: {
        type: 'string',
        description: 'The directory to search in (default: current working directory)',
      },
    },
    required: ['pattern'],
  },

  async execute(input: GlobInput) {
    const searchPath = input.path || process.cwd()
    const pattern = input.pattern

    const matches: Array<{ path: string; mtime: number }> = []

    function walk(dir: string) {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true })

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name)

          // Skip node_modules and hidden directories
          if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
            continue
          }

          if (entry.isDirectory()) {
            walk(fullPath)
          } else if (entry.isFile()) {
            // Match against pattern
            if (matchGlob(fullPath, pattern, searchPath)) {
              const stat = fs.statSync(fullPath)
              matches.push({ path: fullPath, mtime: stat.mtimeMs })
            }
          }
        }
      } catch (error) {
        // Ignore permission errors, etc.
      }
    }

    walk(searchPath)

    // Sort by modification time (most recent first)
    matches.sort((a, b) => b.mtime - a.mtime)

    // Format output
    const relativePaths = matches.map((m) => path.relative(searchPath, m.path))

    if (relativePaths.length === 0) {
      return 'No files found matching pattern'
    }

    return relativePaths.join('\n')
  },
}

function matchGlob(filePath: string, pattern: string, basePath: string): boolean {
  const relativePath = path.relative(basePath, filePath)

  // Convert glob pattern to regex
  // Order matters: escape special chars first, then handle wildcards
  const regexPattern = pattern
    .replace(/\./g, '\\.')           // Escape literal dots first
    .replace(/\*\*/g, '<<DOUBLE_STAR>>')  // Temporarily mark **
    .replace(/\*/g, '[^/]*')         // Single * matches anything except /
    .replace(/<<DOUBLE_STAR>>/g, '.*')    // ** matches anything including /
    .replace(/\?/g, '[^/]')          // ? matches single non-/ char

  const regex = new RegExp(`^${regexPattern}$`)
  return regex.test(relativePath)
}
