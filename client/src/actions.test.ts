// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from '@shared/types.js'

const sendJson = vi.fn()
const authFetch = vi.fn()
vi.mock('./api', () => ({
  authFetch: (...args: unknown[]) => authFetch(...args),
  getJson: vi.fn(),
  readToken: () => null,
  TOKEN_KEY: 't',
  sendJson: (...args: unknown[]) => sendJson(...args),
}))

import { cancelQueued, sendQueuedNow, switchMode } from './actions'
import { useApp } from './store/app'
import { useFeed } from './store/feed'

const session = (mode: string) => ({ id: 's1', mode, isRunning: false }) as unknown as Session

describe('switchMode', () => {
  beforeEach(() => {
    sendJson.mockReset()
    useApp.setState({ session: session('planner'), chatError: null })
  })

  it('applies the session and messages the server answers with, without waiting for the socket', async () => {
    sendJson.mockResolvedValue({
      ok: true,
      json: async () => ({
        session: session('builder'),
        messages: [{ id: 'm1', role: 'user', content: 'x', timestamp: '' }],
        hiddenCount: 2,
      }),
    })
    await switchMode('builder')
    expect(sendJson).toHaveBeenCalledWith('/api/sessions/s1/mode', 'PUT', { mode: 'builder' })
    expect(useApp.getState().session?.mode).toBe('builder')
    expect(useFeed.getState().ids).toEqual(['m1'])
    expect(useFeed.getState().hiddenCount).toBe(2)
  })

  it('keeps the current agent and reports the failure when the server refuses', async () => {
    sendJson.mockResolvedValue({ ok: false, json: async () => ({ error: 'Invalid mode' }) })
    await switchMode('nope')
    expect(useApp.getState().session?.mode).toBe('planner')
    expect(useApp.getState().chatError).toBe('Invalid mode')
  })
})

const queued = (queueId: string, content: string) => ({ queueId, mode: 'asap' as const, content, queuedAt: '' })
const reply = (body: unknown) => ({ ok: true, json: async () => body })

describe('queued messages', () => {
  beforeEach(() => {
    sendJson.mockReset()
    authFetch.mockReset()
    useApp.setState({ session: session('builder'), queue: [queued('q1', 'one'), queued('q2', 'two')] })
  })

  it('removes a cancelled message right away, from the queue the server answers with', async () => {
    authFetch.mockResolvedValue(reply({ success: true, queueState: [queued('q2', 'two')] }))
    await cancelQueued('q1')
    expect(authFetch).toHaveBeenCalledWith('/api/sessions/s1/queue/q1', { method: 'DELETE' })
    expect(useApp.getState().queue.map((item) => item.queueId)).toEqual(['q2'])
  })

  it('sends one now: stops the run, then sends it first and queues the others again in order', async () => {
    sendJson.mockImplementation(async (url: string) =>
      url.endsWith('/stop')
        ? reply({ success: true, queuedMessages: useApp.getState().queue })
        : reply({ success: true }),
    )
    await sendQueuedNow('q2')
    expect(sendJson.mock.calls.map(([url, , body]) => [url, (body as { content?: string }).content])).toEqual([
      ['/api/sessions/s1/stop', undefined],
      ['/api/sessions/s1/message', 'two'],
      ['/api/sessions/s1/message', 'one'],
    ])
  })
})
