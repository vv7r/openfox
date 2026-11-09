// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from '@shared/types.js'

const sendJson = vi.fn()
vi.mock('./api', () => ({
  authFetch: vi.fn(),
  getJson: vi.fn(),
  readToken: () => null,
  TOKEN_KEY: 't',
  sendJson: (...args: unknown[]) => sendJson(...args),
}))

import { switchMode } from './actions'
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
