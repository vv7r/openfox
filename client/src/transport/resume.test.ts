import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ServerMessage } from '@shared/protocol.js'
import {
  acceptSequenced,
  beginResume,
  endResume,
  expectAck,
  getLastEventSeq,
  handleAck,
  resetResumeState,
  setLastEventSeq,
} from './resume'

const event = (seq: number, extra: Partial<ServerMessage> = {}): ServerMessage =>
  ({ type: 'chat.delta', payload: {}, seq, sessionId: 's1', ...extra }) as ServerMessage

describe('resume bookkeeping', () => {
  afterEach(() => {
    resetResumeState()
    vi.useRealTimers()
  })

  it('tracks the last applied seq of shown sessions and drops duplicates', () => {
    expect(acceptSequenced(event(1), true)).toBe(true)
    expect(acceptSequenced(event(2), true)).toBe(true)
    expect(getLastEventSeq('s1')).toBe(2)
    expect(acceptSequenced(event(2), true)).toBe(false)
    expect(acceptSequenced(event(1), true)).toBe(false)
  })

  it('does not track sessions that are not shown', () => {
    expect(acceptSequenced(event(5), false)).toBe(true)
    expect(getLastEventSeq('s1')).toBeUndefined()
  })

  it('lets unsequenced messages through', () => {
    setLastEventSeq('s1', 10)
    expect(acceptSequenced({ type: 'context.state', payload: {}, sessionId: 's1' } as ServerMessage, true)).toBe(true)
  })

  it('drops live events while resuming and applies the replay', () => {
    setLastEventSeq('s1', 3)
    beginResume('s1')
    // A live event that raced the resume request: the replay contains it.
    expect(acceptSequenced(event(6), true)).toBe(false)
    expect(acceptSequenced(event(4, { replay: true }), true)).toBe(true)
    expect(acceptSequenced(event(6, { replay: true }), true)).toBe(true)
    endResume('s1')
    expect(acceptSequenced(event(6), true)).toBe(false)
    expect(acceptSequenced(event(7), true)).toBe(true)
  })

  it('runs the ack handler synchronously, or with null on timeout', () => {
    vi.useFakeTimers()
    const onAck = vi.fn()
    expectAck('a1', onAck, 1000)
    expect(handleAck({ type: 'ack', id: 'a1', payload: { resume: 'replayed' } } as ServerMessage)).toBe(true)
    expect(onAck).toHaveBeenCalledWith({ resume: 'replayed' })
    expect(handleAck({ type: 'ack', id: 'unknown', payload: {} } as ServerMessage)).toBe(false)

    const onTimeout = vi.fn()
    expectAck('a2', onTimeout, 1000)
    vi.advanceTimersByTime(1000)
    expect(onTimeout).toHaveBeenCalledWith(null)
  })

  it('waits for an ack queued behind a timeout that fired late', () => {
    // A long session re-rendered after a reconnect can block the main thread
    // for longer than the timeout: the timer then runs late, possibly before
    // the ack that arrived meanwhile, and forced a second, full reload.
    vi.useFakeTimers()
    const onAck = vi.fn()
    expectAck('a3', onAck, 1000)
    vi.setSystemTime(Date.now() + 15_000)
    vi.advanceTimersByTime(1000)
    expect(onAck).not.toHaveBeenCalled()

    expect(handleAck({ type: 'ack', id: 'a3', payload: { resume: 'replayed' } } as ServerMessage)).toBe(true)
    expect(onAck).toHaveBeenCalledTimes(1)
    expect(onAck).toHaveBeenCalledWith({ resume: 'replayed' })
  })

  it('still times out once the main thread is free again', () => {
    vi.useFakeTimers()
    const onTimeout = vi.fn()
    expectAck('a4', onTimeout, 1000)
    vi.setSystemTime(Date.now() + 15_000)
    vi.advanceTimersByTime(1000)
    vi.advanceTimersByTime(1000)
    expect(onTimeout).toHaveBeenCalledWith(null)
  })
})
