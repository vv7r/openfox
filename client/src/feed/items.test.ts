// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { Message } from '@shared/types.js'
import { deriveItems } from './items'

const build = (list: Array<Partial<Message> & { id: string }>) => ({
  ids: list.map((m) => m.id),
  byId: Object.fromEntries(list.map((m) => [m.id, { role: 'assistant', content: '', timestamp: '', ...m } as Message])),
})

describe('deriveItems', () => {
  it('skips tool messages', () => {
    const { ids, byId } = build([{ id: 'a' }, { id: 't', role: 'tool' }])
    expect(deriveItems(ids, byId).map((i) => i.key)).toEqual(['a'])
  })

  it('collects interleaved sub-agent messages by agent, at first occurrence', () => {
    const { ids, byId } = build([
      { id: '1', subAgentId: 'x', subAgentType: 'verifier' },
      { id: '2', subAgentId: 'y', subAgentType: 'reviewer' },
      { id: '3', subAgentId: 'x', subAgentType: 'verifier' },
    ])
    const items = deriveItems(ids, byId)
    expect(items.map((i) => (i.kind === 'subagent' ? i.ids : []))).toEqual([['1', '3'], ['2']])
  })

  it('adds a divider between context windows and does not merge across it', () => {
    const { ids, byId } = build([
      { id: '1', contextWindowId: 'w1', subAgentId: 'x', subAgentType: 'v' },
      { id: '2', contextWindowId: 'w2', subAgentId: 'x', subAgentType: 'v' },
    ])
    expect(deriveItems(ids, byId).map((i) => i.kind)).toEqual(['subagent', 'divider', 'subagent'])
  })
})
