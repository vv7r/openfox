import type { Message } from '@shared/types.js'

export type FeedItem =
  | { kind: 'message'; key: string; id: string }
  | { kind: 'subagent'; key: string; subAgentId: string; subAgentType: string; ids: string[] }
  | { kind: 'divider'; key: string }

/**
 * Turns the message list into feed rows: tool messages disappear, sub-agent
 * messages collect into one row per agent and context window. Reads only what
 * cannot change during a stream, so it reruns when a message is added and not
 * on every delta.
 */
export function deriveItems(ids: string[], byId: Record<string, Message>): FeedItem[] {
  const items: FeedItem[] = []
  const open = new Map<string, Extract<FeedItem, { kind: 'subagent' }>>()
  let lastWindow: string | undefined

  for (const id of ids) {
    const message = byId[id]
    if (!message || message.role === 'tool') continue

    if (message.contextWindowId && lastWindow && message.contextWindowId !== lastWindow) {
      open.clear()
      items.push({ kind: 'divider', key: `divider-${id}` })
    }
    lastWindow = message.contextWindowId

    if (message.subAgentId && message.subAgentType) {
      const group = open.get(message.subAgentId)
      if (group) {
        group.ids.push(id)
      } else {
        const created = {
          kind: 'subagent',
          key: id,
          subAgentId: message.subAgentId,
          subAgentType: message.subAgentType,
          ids: [id],
        } as const
        const mutable = { ...created, ids: [id] }
        open.set(message.subAgentId, mutable)
        items.push(mutable)
      }
    } else {
      items.push({ kind: 'message', key: id, id })
    }
  }
  return items
}
