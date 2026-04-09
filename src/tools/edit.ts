import * as fs from 'fs'
import type { Tool } from '../definitions/types/index.js'

interface EditInput {
  file_path: string
  old_string: string
  new_string: string
  replace_all?: boolean
}

export const EditTool: Tool<EditInput, string> = {
  name: 'Edit',
  description:
    'Edit a file by replacing a specific string with a new string. Use for making precise changes to existing files.',
  inputSchema: {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: 'The absolute path to the file to edit',
      },
      old_string: {
        type: 'string',
        description: 'The text to replace',
      },
      new_string: {
        type: 'string',
        description: 'The text to replace it with',
      },
      replace_all: {
        type: 'boolean',
        description: 'Replace all occurrences of old_string',
      },
    },
    required: ['file_path', 'old_string', 'new_string'],
  },

  async execute(input: EditInput) {
    if (!fs.existsSync(input.file_path)) {
      return `Error: File not found: ${input.file_path}`
    }

    const content = fs.readFileSync(input.file_path, 'utf-8')

    // Check if old_string exists
    if (!content.includes(input.old_string)) {
      return `Error: Could not find the text to replace in ${input.file_path}`
    }

    // Perform replacement
    let newContent: string
    if (input.replace_all) {
      newContent = content.split(input.old_string).join(input.new_string)
    } else {
      // Check for multiple occurrences
      const occurrences = content.split(input.old_string).length - 1
      if (occurrences > 1) {
        return `Error: Found ${occurrences} occurrences of old_string. Use replace_all=true or provide a more specific old_string.`
      }
      newContent = content.replace(input.old_string, input.new_string)
    }

    fs.writeFileSync(input.file_path, newContent, 'utf-8')

    return `Successfully edited ${input.file_path}`
  },
}
