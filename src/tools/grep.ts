import * as fs from 'fs'
import * as path from 'path'
import type { Tool } from '../definitions/types/index.js'

interface GrepInput {
  pattern: string
  path?: string
  glob?: string
  output_mode?: 'files_with_matches' | 'content' | 'count'
  '-i'?: boolean // case insensitive
  '-n'?: boolean // show line numbers
}

export const GrepTool: Tool<GrepInput, string> = {
  name: 'Grep',
  description:
    'Search for a pattern in files. Returns matching lines or file paths.',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'The regular expression pattern to search for',
      },
      path: {
        type: 'string',
        description: 'The directory or file to search in',
      },
      glob: {
        type: 'string',
        description: 'Glob pattern to filter files (e.g., "*.ts")',
      },
      output_mode: {
        type: 'string',
        enum: ['files_with_matches', 'content', 'count'],
        description: 'Output format',
      },
      '-i': {
        type: 'boolean',
        description: 'Case insensitive search',
      },
      '-n': {
        type: 'boolean',
        description: 'Show line numbers in output',
      },
    },
    required: ['pattern'],
  },

  async execute(input: GrepInput) {
    const searchPath = input.path || process.cwd()
    const pattern = new RegExp(input.pattern, input['-i'] ? 'gi' : 'g')
    const outputMode = input.output_mode || 'content'
    const showLineNumbers = input['-n'] !== false

    const results: Array<{ file: string; line?: number; content?: string }> = []

    function searchFile(filePath: string) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8')
        const lines = content.split('\n')

        let matchCount = 0
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]
          if (pattern.test(line)) {
            matchCount++
            if (outputMode === 'content') {
              results.push({
                file: filePath,
                line: i + 1,
                content: line,
              })
            }
            // Reset regex lastIndex for global regex
            pattern.lastIndex = 0
          }
        }

        if (outputMode === 'files_with_matches' && matchCount > 0) {
          results.push({ file: filePath })
        }

        if (outputMode === 'count' && matchCount > 0) {
          results.push({ file: filePath, content: `${matchCount} matches` })
        }
      } catch (error) {
        // Ignore binary files, permission errors, etc.
      }
    }

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
            // Check glob pattern if specified
            if (input.glob) {
              const match = matchSimpleGlob(entry.name, input.glob)
              if (!match) continue
            }
            searchFile(fullPath)
          }
        }
      } catch (error) {
        // Ignore permission errors
      }
    }

    // Search single file or directory
    if (fs.statSync(searchPath).isFile()) {
      searchFile(searchPath)
    } else {
      walk(searchPath)
    }

    // Format output
    if (results.length === 0) {
      return 'No matches found'
    }

    if (outputMode === 'files_with_matches') {
      return results.map((r) => path.relative(process.cwd(), r.file)).join('\n')
    }

    if (outputMode === 'count') {
      return results
        .map((r) => `${path.relative(process.cwd(), r.file)}: ${r.content}`)
        .join('\n')
    }

    return results
      .map((r) => {
        const relativePath = path.relative(process.cwd(), r.file)
        if (showLineNumbers && r.line !== undefined) {
          return `${relativePath}:${r.line}: ${r.content}`
        }
        return `${relativePath}: ${r.content}`
      })
      .join('\n')
  },
}

function matchSimpleGlob(filename: string, pattern: string): boolean {
  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')
  return new RegExp(`^${regexPattern}$`).test(filename)
}
