import * as fs from 'fs'
import * as path from 'path'
import type { Tool } from '../definitions/types/index.js'

interface ReadInput {
  file_path: string
  offset?: number
  limit?: number
}

export const ReadTool: Tool<ReadInput, string> = {
  name: 'Read',
  description: 'Read a file from the filesystem. Returns the file contents.',
  safeToRetry: true,
  inputSchema: {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: 'The absolute path to the file to read',
      },
      offset: {
        type: 'number',
        description: 'Line number to start reading from (1-indexed)',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of lines to read',
      },
    },
    required: ['file_path'],
  },

  async execute(input: ReadInput) {
    const filePath = path.resolve(input.file_path)

    if (!fs.existsSync(filePath)) {
      return `Error: File not found: ${filePath}`
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      const lines = content.split('\n')

      // Handle offset and limit
      const startLine = input.offset ? input.offset - 1 : 0
      const endLine = input.limit ? startLine + input.limit : lines.length
      const selectedLines = lines.slice(startLine, endLine)

      // Add line numbers
      const numberedLines = selectedLines.map((line, i) => {
        const lineNum = startLine + i + 1
        return `${String(lineNum).padStart(6, ' ')}\t${line}`
      })

      return numberedLines.join('\n')
    } catch (error) {
      return `Error reading file: ${error instanceof Error ? error.message : String(error)}`
    }
  },
}
