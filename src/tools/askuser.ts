import * as readline from 'readline'
import type { Tool } from '../types.js'

interface QuestionOption {
  label: string
  description: string
}

interface Question {
  question: string
  header: string
  options: QuestionOption[]
  multiSelect?: boolean
}

interface AskUserInput {
  questions: Question[]
}

interface AskUserResult {
  questions: Question[]
  answers: Record<string, string>
}

export const AskUserTool: Tool<AskUserInput, string> = {
  name: 'AskUserQuestion',
  description: `Ask the user questions during execution. Use this when you need user input to proceed.
The user can select from provided options or enter custom text.
Returns the user's answers that you should use in your response.`,
  inputSchema: {
    type: 'object',
    properties: {
      questions: {
        type: 'array',
        description: 'Questions to ask the user (1-4 questions)',
        items: {
          type: 'object',
          properties: {
            question: {
              type: 'string',
              description: 'The complete question to ask the user',
            },
            header: {
              type: 'string',
              description: 'Short label displayed as a chip/tag (max 12 chars)',
            },
            options: {
              type: 'array',
              description: 'The available choices (2-4 options)',
              items: {
                type: 'object',
                properties: {
                  label: {
                    type: 'string',
                    description: 'Display text for this option',
                  },
                  description: {
                    type: 'string',
                    description: 'Explanation of this option',
                  },
                },
                required: ['label', 'description'],
              },
            },
            multiSelect: {
              type: 'boolean',
              description: 'Allow multiple selections',
              default: false,
            },
          },
          required: ['question', 'header', 'options'],
        },
      },
    },
    required: ['questions'],
  },

  async execute(input: AskUserInput) {
    const { questions } = input

    if (!questions || questions.length === 0) {
      return 'Error: No questions provided'
    }

    if (questions.length > 4) {
      return 'Error: Maximum 4 questions allowed'
    }

    const answers: Record<string, string> = {}

    for (const q of questions) {
      // Validate question
      if (!q.options || q.options.length < 2 || q.options.length > 4) {
        return `Error: Question "${q.question}" must have 2-4 options`
      }

      try {
        const answer = await askQuestion(q)
        answers[q.question] = answer
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return `Error asking question: ${message}`
      }
    }

    // Format response
    const responseParts = Object.entries(answers).map(
      ([question, answer]) => `"${question}"="${answer}"`,
    )

    return `User answered questions: ${responseParts.join(', ')}. You can now continue with the user's answers in mind.`
  },
}

async function askQuestion(question: Question): Promise<string> {
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    // Display question
    console.log(`\n❓ ${question.question}`)
    console.log(`   [${question.header}]`)
    console.log()

    // Display options
    question.options.forEach((opt, idx) => {
      const letter = String.fromCharCode(97 + idx) // a, b, c, d
      console.log(`   ${letter}) ${opt.label}`)
      console.log(`      ${opt.description}`)
    })
    console.log()

    if (question.multiSelect) {
      console.log('   (Multi-select: separate choices with commas, e.g., "a,c")')
    }
    console.log('   (Or type your own answer)')
    console.log()

    rl.question('   Your answer: ', (answer) => {
      rl.close()

      const trimmed = answer.trim()

      if (!trimmed) {
        // Default to first option if no input
        resolve(question.options[0].label)
        return
      }

      // Check if it's a letter selection
      if (question.multiSelect) {
        // Handle multi-select
        const selections = trimmed.split(',').map((s) => s.trim().toLowerCase())
        const labels: string[] = []

        for (const sel of selections) {
          const idx = sel.charCodeAt(0) - 97 // 'a' = 97
          if (idx >= 0 && idx < question.options.length) {
            labels.push(question.options[idx].label)
          }
        }

        if (labels.length > 0) {
          resolve(labels.join(', '))
          return
        }
      } else {
        // Single select
        const idx = trimmed.toLowerCase().charCodeAt(0) - 97
        if (idx >= 0 && idx < question.options.length) {
          resolve(question.options[idx].label)
          return
        }
      }

      // Custom answer
      resolve(trimmed)
    })
  })
}
