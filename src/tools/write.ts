import * as fs from 'fs'
import * as path from 'path'
import type { Tool } from '../definitions/types/index.js'

interface WriteInput {
  file_path: string
  content: string
}

export const WriteTool: Tool<WriteInput, string> = {
  name: 'Write',
  description: 'Write content to a file. Creates the file if it does not exist, overwrites if it does.',
  inputSchema: {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: 'The absolute path to the file to write',
      },
      content: {
        type: 'string',
        description: 'The content to write to the file',
      },
    },
    required: ['file_path', 'content'],
  },

  async execute(input: WriteInput) {
    const filePath = input.file_path

    // Ensure directory exists
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    // Write file
    fs.writeFileSync(filePath, input.content, 'utf-8')

    return `Successfully wrote ${input.content.length} characters to ${filePath}`
  },
}
