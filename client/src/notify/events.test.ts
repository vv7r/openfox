import { describe, expect, it } from 'vitest'
import type { ServerMessage } from '@shared/protocol.js'
import { DEFAULT_SETTINGS, createEventTracker, isVersionNewer, mergeSettings, resolveEvent } from './events'

const message = (type: string, payload: unknown = {}, sessionId = 's1') =>
  ({ type, payload, sessionId }) as unknown as ServerMessage

describe('mergeSettings', () => {
  it('fills what is missing and keeps new-message sounds off by default', () => {
    const merged = mergeSettings({ soundEnabled: false, events: { complete: { browserNotification: true } } } as never)
    expect(merged.soundEnabled).toBe(false)
    expect(merged.events.complete).toEqual({ soundEnabled: true, browserNotification: true, customSoundUrl: null })
    expect(merged.events.new_message.soundEnabled).toBe(false)
    expect(merged.pluginUpdateCheckInterval).toBe('1h')
  })
})

describe('resolveEvent', () => {
  const settings = {
    ...DEFAULT_SETTINGS,
    agentOverrides: { build: { complete: { soundEnabled: false, customSoundUrl: '/x.mp3' } } },
  }

  it('uses the global config without an agent', () => {
    expect(resolveEvent(settings, 'complete').soundEnabled).toBe(true)
  })

  it('overlays the agent override', () => {
    expect(resolveEvent(settings, 'complete', 'build')).toEqual({
      soundEnabled: false,
      browserNotification: false,
      customSoundUrl: '/x.mp3',
    })
  })

  it('falls back for an agent without overrides', () => {
    expect(resolveEvent(settings, 'complete', 'sub-agent').soundEnabled).toBe(true)
  })
})

describe('event tracker', () => {
  const tracker = (active = 's1') => createEventTracker(() => active)

  it('maps chat.done reasons', () => {
    const next = tracker()
    expect(next(message('chat.done', { reason: 'complete' }))).toEqual({ event: 'complete' })
    expect(next(message('chat.done', { reason: 'waiting_for_user' }))).toEqual({ event: 'waiting_for_user' })
    expect(next(message('chat.done', { reason: 'stopped' }))).toBeNull()
  })

  it('keeps the agent reported by the server', () => {
    expect(tracker()(message('chat.done', { reason: 'complete', agentType: 'sub-agent' }))).toEqual({
      event: 'complete',
      agent: 'sub-agent',
    })
  })

  it('treats confirmations as waiting for input', () => {
    expect(tracker()(message('chat.path_confirmation'))).toEqual({ event: 'waiting_for_user' })
    expect(tracker()(message('session.confirmation_pending'))).toEqual({ event: 'waiting_for_user' })
  })

  it('signals task completion', () => {
    expect(tracker()(message('task.completed'))).toEqual({ event: 'phase_done' })
  })

  it('fires once when a phase becomes blocked', () => {
    const next = tracker()
    const blocked = message('phase.changed', { phase: 'blocked' })
    expect(next(blocked)).toEqual({ event: 'phase_blocked' })
    expect(next(blocked)).toBeNull()
  })

  it('counts a new message once, and only in the open session', () => {
    const next = tracker()
    const delta = message('chat.delta', { messageId: 'm' })
    expect(next(delta)).toEqual({ event: 'new_message' })
    expect(next(delta)).toBeNull()
    expect(next(message('chat.delta', { messageId: 'other' }, 's2'))).toBeNull()
  })

  it('attributes sub-agent messages', () => {
    expect(tracker()(message('chat.delta', { messageId: 'm', subAgentType: 'verifier' }))).toEqual({
      event: 'new_message',
      agent: 'sub-agent',
    })
  })
})

describe('isVersionNewer', () => {
  it('compares release numbers', () => {
    expect(isVersionNewer('2.1.0', '2.0.9')).toBe(true)
    expect(isVersionNewer('2.0.9', '2.1.0')).toBe(false)
    expect(isVersionNewer('2.0.0', '2.0.0')).toBe(false)
  })

  it('ignores prereleases and missing values', () => {
    expect(isVersionNewer('2.1.0-dev', '2.0.0')).toBe(false)
    expect(isVersionNewer(null, '2.0.0')).toBe(false)
  })
})
