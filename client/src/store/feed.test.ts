// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import type { ServerMessage } from '@shared/protocol.js'
import type { Message } from '@shared/types.js'
import { flushDeltas } from './deltaBuffer'
import { applyServerMessage, setHistory, useFeed } from './feed'

const message = (id: string, content = ''): Message => ({ id, role: 'assistant', content, timestamp: '2026-01-01' })
const server = (type: string, payload: unknown, sessionId = 's1') =>
  ({ type, payload, sessionId }) as unknown as ServerMessage

describe('feed store', () => {
  beforeEach(() => setHistory('s1', []))

  it('coalesces deltas into the target message', () => {
    applyServerMessage(server('chat.message', { message: message('m1') }))
    applyServerMessage(server('chat.delta', { messageId: 'm1', content: 'a' }))
    applyServerMessage(server('chat.delta', { messageId: 'm1', content: 'b' }))
    flushDeltas()
    expect(useFeed.getState().byId['m1']?.content).toBe('ab')
  })

  it('keeps other messages referentially stable while one streams', () => {
    setHistory('s1', [message('old', 'x'), message('m1')])
    const before = useFeed.getState().byId['old']
    applyServerMessage(server('chat.delta', { messageId: 'm1', content: 'a' }))
    flushDeltas()
    expect(useFeed.getState().byId['old']).toBe(before)
  })

  it('keeps deltas that arrive before their message', () => {
    applyServerMessage(server('chat.delta', { messageId: 'm1', content: 'early' }))
    flushDeltas()
    applyServerMessage(server('chat.message', { message: message('m1') }))
    flushDeltas()
    expect(useFeed.getState().byId['m1']?.content).toBe('early')
  })

  it('applies buffered text before a message update', () => {
    applyServerMessage(server('chat.message', { message: message('m1') }))
    applyServerMessage(server('chat.delta', { messageId: 'm1', content: 'a' }))
    applyServerMessage(server('chat.message_updated', { messageId: 'm1', updates: { isStreaming: false } }))
    const updated = useFeed.getState().byId['m1']
    expect(updated?.content).toBe('a')
    expect(updated?.isStreaming).toBe(false)
  })

  it('ignores another session and does not duplicate a redelivered message', () => {
    applyServerMessage(server('chat.message', { message: message('m9') }, 's2'))
    expect(useFeed.getState().ids).toEqual([])
    applyServerMessage(server('chat.message', { message: message('m1') }))
    applyServerMessage(server('chat.message', { message: message('m1') }))
    expect(useFeed.getState().ids).toEqual(['m1'])
  })

  it('does not let a snapshot replace loaded history', () => {
    setHistory('s1', [message('m1')])
    applyServerMessage(server('session.state', { session: { id: 's1' }, messages: [] }))
    expect(useFeed.getState().ids).toEqual(['m1'])
  })
})
