import type { Message, PreparingToolCall, ToolCall } from '@shared/types.js'

export type Element =
  | { type: 'text'; content: string }
  | { type: 'tool'; call: ToolCall }
  | { type: 'preparing'; preparing: PreparingToolCall }
  | { type: 'criteria'; calls: ToolCall[]; preparing: PreparingToolCall[] }

export interface MessageElements {
  thinking: string
  elements: Element[]
}

const isCriterionCall = (name: string) => name === 'criterion' || name === 'session_metadata'

function isMetadataAdd(preparing: PreparingToolCall): boolean {
  const args = preparing.arguments ?? ''
  return preparing.name === 'session_metadata' && /"action"\s*:\s*"add"/.test(args) && /"key"\s*:\s*"/.test(args)
}

/** Consecutive criterion calls, and additions still streaming, share one box that grows live. */
function groupCriteria(elements: Element[]): Element[] {
  const grouped: Element[] = []
  let open: Extract<Element, { type: 'criteria' }> | null = null
  const current = () => {
    if (!open) {
      open = { type: 'criteria', calls: [], preparing: [] }
      grouped.push(open)
    }
    return open
  }
  for (const element of elements) {
    if (element.type === 'tool' && isCriterionCall(element.call.name)) current().calls.push(element.call)
    else if (element.type === 'preparing' && isMetadataAdd(element.preparing))
      current().preparing.push(element.preparing)
    else {
      open = null
      grouped.push(element)
    }
  }
  return grouped
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
  return { thinking: thinking.trim() ? thinking : '', elements: groupCriteria(elements) }
}
