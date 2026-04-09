import type { ContentBlock } from '../../definitions/types/index.js'

export function appendTextDelta(content: ContentBlock[], textDelta: string): void {
  if (!textDelta) {
    return
  }

  const lastBlock = content[content.length - 1]
  if (lastBlock?.type === 'text') {
    lastBlock.text += textDelta
    return
  }

  content.push({ type: 'text', text: textDelta })
}
