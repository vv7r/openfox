import type { ServerMessage } from '@shared/protocol.js'

/**
 * Resume support: after a reconnect the client asks the server for the events
 * it missed (session.load with lastEventSeq) instead of reloading the whole
 * session. This module tracks, per shown session, the highest event seq
 * applied, and filters sequenced messages accordingly.
 */

const lastSeqBySession = new Map<string, number>()
/** Sessions waiting for their resume ack: live events are part of the replay. */
const resuming = new Set<string>()

export function getLastEventSeq(sessionId: string): number | undefined {
  return lastSeqBySession.get(sessionId)
}

export function setLastEventSeq(sessionId: string, seq: number): void {
  lastSeqBySession.set(sessionId, seq)
}

export function beginResume(sessionId: string): void {
  resuming.add(sessionId)
}

export function endResume(sessionId: string): void {
  resuming.delete(sessionId)
}

/**
 * Whether a server message should be applied. Only messages carrying an event
 * seq are filtered: while a session resumes, live events are dropped (the
 * server includes them in the replay, in order); after that, events already
 * applied are dropped. `track` records the seq for sessions shown on screen.
 */
export function acceptSequenced(message: ServerMessage, track: boolean): boolean {
  const { seq, sessionId } = message
  if (seq === undefined || !sessionId) return true
  if (resuming.has(sessionId) && !message.replay) return false
  const last = lastSeqBySession.get(sessionId)
  if (last !== undefined && seq <= last) return false
  if (track) lastSeqBySession.set(sessionId, seq)
  return true
}

type AckHandler = (payload: Record<string, unknown> | null) => void
const pendingAcks = new Map<string, AckHandler>()

/** A timer this late ran after the main thread was blocked. */
const LATE_TIMER_MS = 1000
/** Delay before checking again after a late timer. */
const LATE_RECHECK_MS = 1000

/**
 * Run `handler` synchronously when the ack for request `id` arrives (so no
 * later message is processed before it), or with null after `timeoutMs`.
 *
 * A timer that runs late means the main thread was blocked (e.g. a long
 * session rendered after a reconnect): the ack may already be queued behind
 * it, so check again shortly instead of giving up (giving up forces a full
 * reload on top of the resume).
 */
export function expectAck(id: string, handler: AckHandler, timeoutMs: number): void {
  pendingAcks.set(id, handler)
  const arm = (delayMs: number) => {
    const dueAt = Date.now() + delayMs
    setTimeout(() => {
      if (!pendingAcks.has(id)) return
      if (Date.now() - dueAt > LATE_TIMER_MS) {
        arm(LATE_RECHECK_MS)
        return
      }
      pendingAcks.delete(id)
      handler(null)
    }, delayMs)
  }
  arm(timeoutMs)
}

/** Dispatch an ack to its pending handler. Returns true when it was one. */
export function handleAck(message: ServerMessage): boolean {
  if (message.type !== 'ack' || !message.id) return false
  const handler = pendingAcks.get(message.id)
  if (!handler) return false
  pendingAcks.delete(message.id)
  handler((message.payload ?? null) as Record<string, unknown> | null)
  return true
}

/** Test-only: forget everything. */
export function resetResumeState(): void {
  lastSeqBySession.clear()
  resuming.clear()
  pendingAcks.clear()
}
