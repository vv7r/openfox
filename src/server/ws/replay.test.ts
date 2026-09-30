import { describe, expect, it } from 'vitest'
import type { StoredEvent } from '../events/types.js'
import { buildReplayMessages } from './replay.js'

let seq = 0
function event(type: string, data: unknown): StoredEvent {
  return { seq: ++seq, sessionId: 's1', timestamp: 1_700_000_000_000, type, data } as StoredEvent
}

describe('buildReplayMessages', () => {
  it('merges consecutive deltas of the same message and keeps the last seq', () => {
    seq = 10
    const messages = buildReplayMessages([
      event('message.delta', { messageId: 'm1', content: 'Hel' }),
      event('message.delta', { messageId: 'm1', content: 'lo' }),
      event('message.delta', { messageId: 'm1', content: '!' }),
    ])
    expect(messages).toEqual([
      {
        type: 'chat.delta',
        payload: { messageId: 'm1', content: 'Hello!' },
        seq: 13,
        sessionId: 's1',
        replay: true,
      },
    ])
  })

  it('keeps the order of interleaved events and never merges across them', () => {
    seq = 0
    const messages = buildReplayMessages([
      event('message.thinking', { messageId: 'm1', content: 'a' }),
      event('message.thinking', { messageId: 'm1', content: 'b' }),
      event('message.delta', { messageId: 'm1', content: 'x' }),
      event('tool.output', { messageId: 'm1', toolCallId: 't1', stream: 'stdout', content: '1' }),
      event('tool.output', { messageId: 'm1', toolCallId: 't1', stream: 'stderr', content: '2' }),
      event('tool.output', { messageId: 'm1', toolCallId: 't1', stream: 'stderr', content: '3' }),
      event('message.delta', { messageId: 'm1', content: 'y' }),
    ])
    const text = (payload: unknown) => {
      const p = payload as { content?: string; output?: string }
      return p.content ?? p.output
    }
    expect(messages.map((m) => [m.type, text(m.payload), m.seq])).toEqual([
      ['chat.thinking', 'ab', 2],
      ['chat.delta', 'x', 3],
      ['chat.tool_output', '1', 4],
      ['chat.tool_output', '23', 6],
      ['chat.delta', 'y', 7],
    ])
  })

  it('does not merge deltas of different messages', () => {
    seq = 0
    const messages = buildReplayMessages([
      event('message.delta', { messageId: 'm1', content: 'a' }),
      event('message.delta', { messageId: 'm2', content: 'b' }),
    ])
    expect(messages).toHaveLength(2)
  })

  it('skips events that have no client message (snapshots)', () => {
    seq = 0
    const messages = buildReplayMessages([
      event('turn.snapshot', { messages: [] }),
      event('message.delta', { messageId: 'm1', content: 'a' }),
    ])
    expect(messages.map((m) => m.type)).toEqual(['chat.delta'])
  })
})
