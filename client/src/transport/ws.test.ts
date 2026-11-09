// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Socket } from './ws'

const sent: string[] = []

class FakeWebSocket {
  static readonly OPEN = 1
  readyState = FakeWebSocket.OPEN
  onopen: (() => void) | null = null
  send(data: string) {
    sent.push(data)
  }
}

describe('Socket on a plain http origin', () => {
  beforeEach(() => {
    sent.length = 0
    vi.stubGlobal('WebSocket', FakeWebSocket)
    // Browsers only define crypto.randomUUID in secure contexts
    vi.stubGlobal('crypto', { getRandomValues: (values: Uint8Array) => values })
  })

  afterEach(() => vi.unstubAllGlobals())

  it('still sends messages with an id', () => {
    const socket = new Socket(
      () => {},
      () => {},
    )
    socket.connect()
    const id = socket.send('session.load', { sessionId: 's1' })
    expect(id).toEqual(expect.any(String))
    expect(JSON.parse(sent[0]!)).toMatchObject({ id, type: 'session.load', payload: { sessionId: 's1' } })
  })
})
