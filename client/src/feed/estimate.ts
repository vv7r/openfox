import type { Message } from '@shared/types.js'
import type { FeedItem } from './items'

/** Measured on the feed's own type: 13.5 px text and 13 px code. */
const CHAR_WIDTH_PX = 8.2
const TEXT_LINE_PX = 23
const CODE_LINE_PX = 18
const PARAGRAPH_GAP_PX = 12
const TOOL_ROW_PX = 40
const FOLDED_ROW_PX = 38
const MESSAGE_PADDING_PX = 16
const USER_BUBBLE_PADDING_PX = 34
/** User bubbles take part of the feed's width. */
const USER_BUBBLE_SHARE = 0.7
const THINKING_ROW_PX = 27
const SUBAGENT_PX = 60
const FEED_SIDE_PADDING_PX = 32

function textHeight(text: string, width: number): number {
  if (text.trim() === '') return 0
  const perLine = Math.max(24, Math.floor((width - FEED_SIDE_PADDING_PX) / CHAR_WIDTH_PX))
  let height = 0
  let inCode = false
  for (const line of text.split('\n')) {
    if (line.trimStart().startsWith('```')) {
      inCode = !inCode
      height += CODE_LINE_PX
    } else if (inCode) {
      height += CODE_LINE_PX
    } else if (line.trim() === '') {
      height += PARAGRAPH_GAP_PX
    } else {
      height += Math.ceil(line.length / perLine) * TEXT_LINE_PX
    }
  }
  return height
}

function messageHeight(message: Message, width: number): number {
  if (message.isSystemGenerated || message.role === 'system') return FOLDED_ROW_PX
  if (message.role === 'user')
    return USER_BUBBLE_PADDING_PX + textHeight(message.content, width * USER_BUBBLE_SHARE - FEED_SIDE_PADDING_PX)
  return (
    MESSAGE_PADDING_PX +
    textHeight(message.content, width) +
    (message.toolCalls?.length ?? 0) * TOOL_ROW_PX +
    (message.thinkingContent ? THINKING_ROW_PX : 0)
  )
}

/**
 * A row's likely height before it is measured. The virtual list places unseen rows with it,
 * so the closer it is, the less the list has to move when they come into view.
 */
export function estimateItemHeight(item: FeedItem, byId: Record<string, Message>, width: number): number {
  if (item.kind === 'divider') return FOLDED_ROW_PX
  if (item.kind === 'subagent') return SUBAGENT_PX
  const message = byId[item.id]
  return message ? Math.max(FOLDED_ROW_PX, messageHeight(message, width)) : FOLDED_ROW_PX
}
