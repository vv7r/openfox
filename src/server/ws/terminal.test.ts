import { beforeEach, describe, expect, it, vi } from 'vitest'
import WebSocket from 'ws'

const manager = vi.hoisted(() => ({
  history: '' as string,
  output: [] as Array<(output: { sessionId: string; data: string }) => void>,
}))

vi.mock('../terminal/manager.js', () => ({
  terminalManager: {
    getOutputHistory: () => manager.history,
    onOutput: (callback: (output: { sessionId: string; data: string }) => void) => manager.output.push(callback),
    onExit: () => undefined,
  },
}))

import { handleTerminalMessage } from './terminal.js'

function socket() {
  return { readyState: WebSocket.OPEN, send: vi.fn() } as unknown as WebSocket & { send: ReturnType<typeof vi.fn> }
}

const sentData = (ws: { send: ReturnType<typeof vi.fn> }) =>
  ws.send.mock.calls.map(([raw]) => (JSON.parse(raw as string) as { payload: { data: string } }).payload.data)

const subscribe = (ws: WebSocket, sessionId: string) =>
  handleTerminalMessage(ws, { type: 'terminal.subscribe', payload: { sessionId } })

describe('terminal.subscribe', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    manager.history = ''
  })

  const print = (sessionId: string, data: string) => {
    manager.history += data
    manager.output.forEach((callback) => callback({ sessionId, data }))
  }

  it('keeps the shell redraw after the history it replaces', () => {
    manager.history = 'prompt$ '
    const ws = socket()
    subscribe(ws, 'shell-1')

    // A resize makes the shell redraw its prompt while the replay is pending
    print('shell-1', '\r[redraw]$ ')
    vi.advanceTimersByTime(1000)

    expect(sentData(ws)).toEqual(['prompt$ \r[redraw]$ '])
  })

  it('delivers what the shell prints during the wait exactly once', () => {
    const ws = socket()
    subscribe(ws, 'shell-2')
    print('shell-2', 'prompt$ ')
    vi.advanceTimersByTime(1000)
    expect(sentData(ws)).toEqual(['prompt$ '])
  })

  it('sends new output live once the history is out', () => {
    manager.history = 'old'
    const ws = socket()
    subscribe(ws, 'shell-3')
    vi.advanceTimersByTime(1000)
    print('shell-3', ' new')
    expect(sentData(ws)).toEqual(['old', ' new'])
  })

  it('replays again when the same socket subscribes again, without double delivery', () => {
    manager.history = 'old'
    const ws = socket()
    subscribe(ws, 'shell-4')
    vi.advanceTimersByTime(1000)
    subscribe(ws, 'shell-4')
    subscribe(ws, 'shell-4')
    vi.advanceTimersByTime(1000)
    print('shell-4', ' new')
    expect(sentData(ws)).toEqual(['old', 'old', ' new'])
  })

  it('does not write to a socket closed during the wait', () => {
    manager.history = 'old'
    const ws = socket()
    subscribe(ws, 'shell-5')
    Object.defineProperty(ws, 'readyState', { value: WebSocket.CLOSED })
    vi.advanceTimersByTime(1000)
    expect(ws.send).not.toHaveBeenCalled()
  })
})
