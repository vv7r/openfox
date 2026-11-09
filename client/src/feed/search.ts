import type { Message } from '@shared/types.js'
import { t } from '../i18n'
import type { FeedItem } from './items'

export type SearchCategory = 'user' | 'thinking' | 'response'

export interface SearchEntry {
  key: string
  /** Position in the feed, for scrolling back to it. */
  index: number
  category: SearchCategory | null
  label: string
  words: string[]
  timestamp?: string
}

const LABEL_LENGTH = 200

export function fuzzyMatch(words: string[], query: string): boolean {
  if (!query) return true
  return query
    .toLowerCase()
    .split(/\s+/)
    .every((part) =>
      words.some((word) => {
        let found = 0
        for (let at = 0; at < word.length && found < part.length; at++) {
          if (word[at] === part[found]) found++
        }
        return found === part.length
      }),
    )
}

const cleanText = (text: string) =>
  text
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()

function categoryOf(message: Message): SearchCategory | null {
  if (message.role === 'user') return 'user'
  if (message.role !== 'assistant') return null
  if (message.content?.trim()) return 'response'
  return message.thinkingContent?.trim() ? 'thinking' : null
}

function workflowLabel(content: string): string {
  try {
    const { workflowName } = JSON.parse(content) as { workflowName: string }
    return t({ en: 'Workflow: {{name}}', fr: 'Workflow : {{name}}' }, { name: workflowName })
  } catch {
    return t({ en: 'Workflow started', fr: 'Workflow démarré' })
  }
}

function kindLabel(message: Message): string | null {
  switch (message.messageKind) {
    case 'workflow-started':
      return workflowLabel(message.content ?? '')
    case 'task-completed':
      return t({ en: 'Task completed', fr: 'Tâche terminée' })
    case 'correction':
      return t({ en: 'Correction', fr: 'Correction' })
    case 'context-reset':
      return t({ en: 'Context reset', fr: 'Contexte réinitialisé' })
    case 'command':
      return t({ en: 'Command executed', fr: 'Commande exécutée' })
    default:
      return null
  }
}

function truncate(text: string): string {
  return text.length > LABEL_LENGTH ? `${text.slice(0, LABEL_LENGTH)}...` : text
}

function messageEntry(message: Message, key: string, index: number): SearchEntry | null {
  if (message.messageKind === 'auto-prompt') return null
  const text = cleanText(message.content || '') || (message.thinkingContent?.trim() ?? '')
  if (message.role === 'assistant' && !text) return null
  return {
    key,
    index,
    category: categoryOf(message),
    label: kindLabel(message) ?? truncate(text),
    words: text.toLowerCase().split(/\s+/),
    timestamp: message.timestamp,
  }
}

/** Search rows of the feed; `index` stays the position in `items`. */
export function buildEntries(items: FeedItem[], byId: Record<string, Message>): SearchEntry[] {
  return items.flatMap((item, index) => {
    if (item.kind === 'divider') return []
    if (item.kind === 'subagent') {
      const label = t({ en: 'Sub-agent: {{type}}', fr: 'Sous-agent : {{type}}' }, { type: item.subAgentType })
      const timestamp = byId[item.ids[0] ?? '']?.timestamp
      return [
        {
          key: item.key,
          index,
          category: null,
          label,
          words: label.toLowerCase().split(/\s+/),
          ...(timestamp ? { timestamp } : {}),
        },
      ]
    }
    const message = byId[item.id]
    const entry = message && messageEntry(message, item.key, index)
    return entry ? [entry] : []
  })
}

/** Newest first, so the top of the list is the most recent match. */
export function filterEntries(
  entries: SearchEntry[],
  query: string,
  filters: ReadonlySet<SearchCategory>,
): SearchEntry[] {
  return entries
    .filter(
      (entry) => (entry.category === null || filters.has(entry.category)) && fuzzyMatch(entry.words, query.trim()),
    )
    .reverse()
}
