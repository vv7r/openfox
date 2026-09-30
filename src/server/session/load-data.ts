/**
 * Everything a client needs to display a session, built from the event store.
 *
 * Used by the REST load (GET /api/sessions/:id). A resume after a reconnect
 * uses the lighter buildSessionResumeState below, with the same shapes.
 *
 * Synchronous on purpose: the resume path builds its state, the replayed
 * events and its ack in one tick, so no event can land in between.
 */

import type { Message, SessionStatsSummary } from '../../shared/types.js'
import { computeSessionStatsSummary } from '../../shared/stats.js'
import { combineEventsWithSnapshot, getEventStore } from '../events/index.js'
import {
  buildMessagesFromStoredEvents,
  buildSessionStatsMessages,
  foldPendingConfirmations,
} from '../events/folding.js'
import { getPendingQuestionsForSession } from '../tools/index.js'
import { toClientSession } from './client-session.js'
import type { SessionManager } from './manager.js'

export interface SessionLoadData {
  session: ReturnType<typeof toClientSession>
  messages?: Message[]
  hiddenCount?: number
  sessionStats: SessionStatsSummary | null
  contextState: ReturnType<SessionManager['getContextState']>
  queueState: ReturnType<SessionManager['getQueueState']>
  pendingQuestions: ReturnType<typeof getPendingQuestionsForSession>
  pendingConfirmations: ReturnType<typeof foldPendingConfirmations>
  activeWorkflowExecution: ReturnType<SessionManager['getDisplayWorkflowExecution']>
  /** Highest stored event seq for the session: where a later resume starts from. */
  lastEventSeq: number
}

export function buildSessionLoadData(
  sessionManager: SessionManager,
  sessionId: string,
  options: { includeMessages: boolean; maxVisibleItems?: number | undefined },
): SessionLoadData | null {
  const session = sessionManager.getSession(sessionId)
  if (!session) return null

  const eventStore = getEventStore()
  const { snapshot, events: eventsSinceSnapshot } = eventStore.getEventsSinceSnapshot(sessionId)
  const events = combineEventsWithSnapshot(sessionId, snapshot, eventsSinceSnapshot)
  const loaded = options.includeMessages ? buildMessagesFromStoredEvents(events, options.maxVisibleItems) : null

  return {
    session: toClientSession(session),
    ...(loaded ? { messages: loaded.messages, hiddenCount: loaded.hiddenCount } : {}),
    sessionStats: computeSessionStatsSummary(buildSessionStatsMessages(events)),
    contextState: sessionManager.getContextState(sessionId),
    queueState: sessionManager.getQueueState(sessionId),
    pendingQuestions: getPendingQuestionsForSession(sessionId),
    pendingConfirmations: foldPendingConfirmations(events),
    activeWorkflowExecution: sessionManager.getDisplayWorkflowExecution(sessionId),
    lastEventSeq: eventStore.getLatestSeq(sessionId) ?? 0,
  }
}

/**
 * State sent with a resume ack: only what is cheap to read. Unlike the REST
 * load it does not fold the event log (that is what makes a long session slow
 * to load): the missed events are replayed instead, and session stats arrive
 * with the next session.state at the end of the turn. Path confirmation
 * events are not streamed through the log, so the pending ones are read here
 * (their events only, filtered in SQL).
 */
export interface SessionResumeState {
  session: ReturnType<typeof toClientSession>
  contextState: ReturnType<SessionManager['getContextState']>
  queueState: ReturnType<SessionManager['getQueueState']>
  pendingQuestions: ReturnType<typeof getPendingQuestionsForSession>
  pendingConfirmations: ReturnType<typeof foldPendingConfirmations>
  activeWorkflowExecution: ReturnType<SessionManager['getDisplayWorkflowExecution']>
  lastEventSeq: number
}

export function buildSessionResumeState(sessionManager: SessionManager, sessionId: string): SessionResumeState | null {
  const session = sessionManager.getSession(sessionId)
  if (!session) return null
  const eventStore = getEventStore()
  return {
    session: toClientSession(session),
    contextState: sessionManager.getContextState(sessionId),
    queueState: sessionManager.getQueueState(sessionId),
    pendingQuestions: getPendingQuestionsForSession(sessionId),
    pendingConfirmations: foldPendingConfirmations(
      eventStore.getEventsOfTypes(
        sessionId,
        ['path.confirmation_pending', 'path.confirmation_responded'],
        eventStore.getLatestSnapshotSeq(sessionId),
      ),
    ),
    activeWorkflowExecution: sessionManager.getDisplayWorkflowExecution(sessionId),
    lastEventSeq: eventStore.getLatestSeq(sessionId) ?? 0,
  }
}
