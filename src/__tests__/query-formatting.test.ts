import { describe, expect, test } from 'bun:test'
import { appendTextDelta } from '../core/query.js'
import type { ContentBlock } from '../types.js'

describe('query formatting', () => {
  test('should merge continuous text deltas into a single text block', () => {
    const content: ContentBlock[] = []

    appendTextDelta(content, '通过\n')
    appendTextDelta(content, '`use')
    appendTextDelta(content, 'Store`')

    expect(content).toEqual([
      {
        type: 'text',
        text: '通过\n`useStore`',
      },
    ])
  })

  test('should start a new text block after non-text block', () => {
    const content: ContentBlock[] = [
      {
        type: 'tool_use',
        id: 'tool_1',
        name: 'Read',
        input: { file_path: 'README.md' },
      },
    ]

    appendTextDelta(content, '工具执行完成')

    expect(content).toEqual([
      {
        type: 'tool_use',
        id: 'tool_1',
        name: 'Read',
        input: { file_path: 'README.md' },
      },
      {
        type: 'text',
        text: '工具执行完成',
      },
    ])
  })

  test('should ignore empty text delta', () => {
    const content: ContentBlock[] = []

    appendTextDelta(content, '')

    expect(content).toEqual([])
  })
})
