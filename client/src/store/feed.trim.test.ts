// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import type { ServerMessage } from '@shared/protocol.js'
import type { Message } from '@shared/types.js'
import { applyServerMessage, setHistory, setMaxFeedItems, useFeed } from './feed'

const message = (id: string) => ({ id, role: 'user', content: id }) as Message
const incoming = (id: string) =>
  ({ type: 'chat.message', sessionId: 's', payload: { message: message(id) } }) as unknown as ServerMessage

describe('maxVisibleItems', () => {
  beforeEach(() => setMaxFeedItems(0))

  it('keeps everything when no limit is set', () => {
    setHistory('s', ['a', 'b', 'c'].map(message))
    expect(useFeed.getState().ids).toEqual(['a', 'b', 'c'])
  })

  it('keeps the most recent items of a loaded history and counts the rest as hidden', () => {
    setMaxFeedItems(2)
    setHistory('s', ['a', 'b', 'c'].map(message), 1)
    expect(useFeed.getState().ids).toEqual(['b', 'c'])
    expect(useFeed.getState().hiddenCount).toBe(2)
    expect(useFeed.getState().byId['a']).toBeUndefined()
  })

  it('drops the oldest item as new ones arrive', () => {
    setMaxFeedItems(2)
    setHistory('s', ['a', 'b'].map(message))
    applyServerMessage(incoming('c'))
    expect(useFeed.getState().ids).toEqual(['b', 'c'])
    expect(useFeed.getState().hiddenCount).toBe(1)
  })
})

describe('what the limit must not remove', () => {
  const agent = (id: string, extra: Partial<Message> = {}) =>
    ({ id, role: 'assistant', content: '', ...extra }) as Message

  beforeEach(() => setMaxFeedItems(0))

  it('shows a whole history when asked to', () => {
    setMaxFeedItems(2)
    setHistory('s', ['a', 'b', 'c', 'd'].map(message), 0, { keepAll: true })
    expect(useFeed.getState().ids).toEqual(['a', 'b', 'c', 'd'])
    expect(useFeed.getState().hiddenCount).toBe(0)
  })

  it('keeps the whole current run, whose writes lock files', () => {
    setMaxFeedItems(2)
    setHistory('s', [message('old'), message('ask'), agent('w1'), agent('w2'), agent('w3')])
    expect(useFeed.getState().ids).toEqual(['ask', 'w1', 'w2', 'w3'])
  })

  it('counts a system prompt as part of the run', () => {
    setMaxFeedItems(1)
    setHistory('s', [message('ask'), { ...message('auto'), isSystemGenerated: true }, agent('w1')])
    expect(useFeed.getState().ids).toEqual(['ask', 'auto', 'w1'])
  })

  it('never removes a message still streaming', () => {
    setMaxFeedItems(1)
    setHistory('s', [agent('live', { isStreaming: true }), message('later'), agent('next')])
    expect(useFeed.getState().ids).toEqual(['live', 'later', 'next'])
  })
})
