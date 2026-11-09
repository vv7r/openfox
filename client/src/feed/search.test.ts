import { describe, expect, it } from 'vitest'
import type { Message } from '@shared/types.js'
import type { FeedItem } from './items'
import { buildEntries, filterEntries, fuzzyMatch, type SearchCategory } from './search'

const ALL = new Set<SearchCategory>(['user', 'thinking', 'response'])

function message(id: string, over: Partial<Message>): Message {
  return { id, role: 'user', content: '', timestamp: '2026-11-09T08:00:00.000Z', ...over } as Message
}

const items = (ids: string[]): FeedItem[] => ids.map((id) => ({ kind: 'message', key: id, id }))

describe('fuzzyMatch', () => {
  it('matches a subsequence inside one word, for each query part', () => {
    expect(fuzzyMatch(['refactor', 'login'], 'rfc lgn')).toBe(true)
    expect(fuzzyMatch(['refactor', 'login'], 'zzz')).toBe(false)
  })

  it('matches everything on an empty query', () => {
    expect(fuzzyMatch(['a'], '')).toBe(true)
  })
})

describe('buildEntries', () => {
  it('classifies messages and keeps the feed index', () => {
    const byId = {
      a: message('a', { content: 'Hello' }),
      b: message('b', { role: 'assistant', content: 'Answer', thinkingContent: 'hmm' }),
      c: message('c', { role: 'assistant', thinkingContent: 'only thinking' }),
    }
    const entries = buildEntries(items(['a', 'b', 'c']), byId)
    expect(entries.map((entry) => entry.category)).toEqual(['user', 'response', 'thinking'])
    expect(entries.map((entry) => entry.index)).toEqual([0, 1, 2])
    expect(entries[2]!.label).toBe('only thinking')
  })

  it('drops dividers, auto prompts and empty assistant messages', () => {
    const byId = {
      a: message('a', { content: 'x', messageKind: 'auto-prompt' }),
      b: message('b', { role: 'assistant' }),
      c: message('c', { content: 'kept' }),
    }
    const entries = buildEntries([{ kind: 'divider', key: 'd' }, ...items(['a', 'b', 'c'])], byId)
    expect(entries.map((entry) => entry.index)).toEqual([3])
  })

  it('strips tags and long content from the label but searches the full text', () => {
    const tail = 'needleword'
    const byId = { a: message('a', { content: `<b>Bold</b> ${'x'.repeat(300)} ${tail}` }) }
    const [entry] = buildEntries(items(['a']), byId)
    expect(entry!.label.startsWith('Bold')).toBe(true)
    expect(entry!.label.length).toBeLessThanOrEqual(203)
    expect(filterEntries([entry!], tail, ALL)).toHaveLength(1)
  })

  it('names sub-agents and workflow starts', () => {
    const byId = {
      a: message('a', { content: JSON.stringify({ workflowName: 'Ship' }), messageKind: 'workflow-started' }),
    }
    const entries = buildEntries(
      [...items(['a']), { kind: 'subagent', key: 's', subAgentId: 's', subAgentType: 'verifier', ids: [] }],
      byId,
    )
    expect(entries[0]!.label).toContain('Ship')
    expect(entries[1]!.label).toContain('verifier')
    expect(entries[1]!.category).toBeNull()
  })
})

describe('filterEntries', () => {
  const byId = {
    a: message('a', { content: 'login bug' }),
    b: message('b', { role: 'assistant', content: 'login fixed' }),
  }
  const entries = buildEntries(items(['a', 'b']), byId)

  it('lists the newest first', () => {
    expect(filterEntries(entries, '', ALL).map((entry) => entry.key)).toEqual(['b', 'a'])
  })

  it('applies category filters, also while searching', () => {
    expect(filterEntries(entries, 'login', new Set<SearchCategory>(['user'])).map((entry) => entry.key)).toEqual(['a'])
  })

  it('keeps uncategorised rows whatever the filters', () => {
    const agent = { key: 's', index: 9, category: null, label: 'x', words: ['x'] }
    expect(filterEntries([agent], '', new Set())).toEqual([agent])
  })
})
