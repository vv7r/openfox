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

  it('applies a snapshot without losing text the live copy already has', () => {
    setHistory('s1', [message('m1', 'streamed text')])
    applyServerMessage(
      server('session.state', { session: { id: 's1' }, messages: [message('m1', 'stream'), message('m2', 'x')] }),
    )
    expect(useFeed.getState().ids).toEqual(['m1', 'm2'])
    expect(useFeed.getState().byId['m1']?.content).toBe('streamed text')
  })

  it('moves a preparing tool call to a real one, then attaches its result and drops the stream', () => {
    applyServerMessage(server('chat.message', { message: message('m1') }))
    applyServerMessage(
      server('chat.tool_preparing', { messageId: 'm1', index: 0, name: 'run_command', arguments: '{' }),
    )
    expect(useFeed.getState().byId['m1']?.preparingToolCalls).toHaveLength(1)

    applyServerMessage(
      server('chat.tool_call', { messageId: 'm1', callId: 'c1', tool: 'run_command', args: { command: 'ls' } }),
    )
    expect(useFeed.getState().byId['m1']?.preparingToolCalls).toBeUndefined()

    applyServerMessage(server('chat.tool_output', { messageId: 'm1', callId: 'c1', stream: 'stdout', output: 'a' }))
    applyServerMessage(server('chat.tool_output', { messageId: 'm1', callId: 'c1', stream: 'stdout', output: 'b' }))
    flushDeltas()
    expect(useFeed.getState().byId['m1']?.toolCalls?.[0]?.streamingOutput?.[0]?.content).toBe('ab')

    applyServerMessage(
      server('chat.tool_result', {
        messageId: 'm1',
        callId: 'c1',
        result: { success: true, durationMs: 1, truncated: false },
      }),
    )
    const call = useFeed.getState().byId['m1']?.toolCalls?.[0]
    expect(call?.result?.success).toBe(true)
    expect(call?.streamingOutput).toBeUndefined()
  })

  it('keeps tool output that arrives before its tool call', () => {
    applyServerMessage(server('chat.message', { message: message('m1') }))
    applyServerMessage(server('chat.tool_output', { messageId: 'm1', callId: 'c1', stream: 'stdout', output: 'early' }))
    flushDeltas()
    applyServerMessage(server('chat.tool_call', { messageId: 'm1', callId: 'c1', tool: 't', args: {} }))
    flushDeltas()
    expect(useFeed.getState().byId['m1']?.toolCalls?.[0]?.streamingOutput?.[0]?.content).toBe('early')
  })

  it('never regresses streamed content on a message update', () => {
    applyServerMessage(server('chat.message', { message: message('m1', 'long content') }))
    applyServerMessage(server('chat.message_updated', { messageId: 'm1', updates: { content: 'long' } }))
    expect(useFeed.getState().byId['m1']?.content).toBe('long content')
  })

  it('finishes a message on chat.done', () => {
    applyServerMessage(server('chat.message', { message: { ...message('m1'), isStreaming: true } }))
    applyServerMessage(server('chat.delta', { messageId: 'm1', content: 'a' }))
    applyServerMessage(server('chat.done', { messageId: 'm1', reason: 'complete' }))
    const done = useFeed.getState().byId['m1']
    expect(done?.isStreaming).toBe(false)
    expect(done?.content).toBe('a')
    expect(done?.completeReason).toBe('complete')
  })
})
