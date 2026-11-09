import type { Message, PreparingToolCall, ToolCall } from '@shared/types.js'

export type Element =
  | { type: 'text'; content: string }
  | { type: 'tool'; call: ToolCall }
  | { type: 'preparing'; preparing: PreparingToolCall }

export interface MessageElements {
  thinking: string
  elements: Element[]
}

/** The message's content in reading order; thinking is shown once, above it. */
export function toElements(message: Message): MessageElements {
  const elements: Element[] = []
  let thinking = ''

  if (message.segments?.length) {
    const calls = new Map(message.toolCalls?.map((call) => [call.id, call]))
    for (const segment of message.segments) {
      if (segment.type === 'text') elements.push({ type: 'text', content: segment.content })
      else if (segment.type === 'thinking') thinking += segment.content
      else {
        const call = calls.get(segment.toolCallId)
        if (call) elements.push({ type: 'tool', call })
      }
    }
  } else {
    thinking = message.thinkingContent ?? ''
    if (message.content) elements.push({ type: 'text', content: message.content })
    message.toolCalls?.forEach((call) => elements.push({ type: 'tool', call }))
  }

  message.preparingToolCalls?.forEach((preparing) => elements.push({ type: 'preparing', preparing }))
  return { thinking: thinking.trim() ? thinking : '', elements }
}
