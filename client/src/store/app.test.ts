// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import type { ServerMessage } from '@shared/protocol.js'
import type { Session, SessionSummary } from '@shared/types.js'
import { applyAppMessage, confirmationsFromServer, parseLayout, useApp } from './app'

const summary = (id: string, isRunning = false) => ({ id, projectId: 'p', isRunning }) as SessionSummary
const server = (type: string, payload: unknown, sessionId?: string) =>
  ({ type, payload, sessionId }) as unknown as ServerMessage

describe('applyAppMessage', () => {
  beforeEach(() => {
    useApp.setState({
      sessions: [summary('a'), summary('b')],
      session: { id: 'a', isRunning: false } as Session,
      git: null,
    })
  })

  it('updates the running flag on the list and the open session', () => {
    applyAppMessage(server('session.running', { isRunning: true }, 'a'))
    expect(useApp.getState().session?.isRunning).toBe(true)
    expect(useApp.getState().sessions.map((s) => s.isRunning)).toEqual([true, false])
  })

  it('leaves the open session alone when another one runs', () => {
    applyAppMessage(server('session.running', { isRunning: true }, 'b'))
    expect(useApp.getState().session?.isRunning).toBe(false)
  })

  it('ignores the git status of another session', () => {
    applyAppMessage(server('git.status', { branch: 'x', diff: { files: [] } }, 'b'))
    expect(useApp.getState().git).toBeNull()
    applyAppMessage(server('git.status', { branch: 'y', diff: { files: [] } }, 'a'))
    expect(useApp.getState().git?.branch).toBe('y')
  })

  it('takes the project list the server sends after another client changed it', () => {
    useApp.setState({ projects: [{ id: 'old', name: 'Old' }] as never })
    applyAppMessage(server('project.list', { projects: [{ id: 'new', name: 'New' }] }))
    expect(useApp.getState().projects.map((p) => p.id)).toEqual(['new'])
  })

  it('adds a created session once, and removes a deleted one', () => {
    const created = server('session.created', { session: summary('c') })
    applyAppMessage(created)
    applyAppMessage(created)
    expect(useApp.getState().sessions.map((s) => s.id)).toEqual(['c', 'a', 'b'])
    applyAppMessage(server('session.deleted', { sessionId: 'a' }))
    expect(useApp.getState().sessions.map((s) => s.id)).toEqual(['c', 'b'])
  })
})

describe('events the feed does not own', () => {
  beforeEach(() => {
    useApp.setState({
      sessions: [summary('a'), { ...summary('b'), projectId: 'other' }],
      session: { id: 'a', projectId: 'p', isRunning: true } as Session,
      llmRetry: null,
      visionFallbacks: {},
      unreadSessions: [],
      confirmationsElsewhere: {},
    })
  })

  it('tracks the pause state of the open session', () => {
    applyAppMessage(server('session.pause', { pauseState: 'pending' }, 'a'))
    expect(useApp.getState().session?.pauseState).toBe('pending')
    applyAppMessage(server('session.pause', { pauseState: 'paused' }, 'b'))
    expect(useApp.getState().session?.pauseState).toBe('pending')
  })

  it('replaces the criteria of the open session', () => {
    const criteria = [{ id: 'c1', description: 'x', status: { type: 'pending' }, attempts: [] }]
    applyAppMessage(server('criteria.updated', { criteria }, 'a'))
    expect(useApp.getState().session?.criteria).toEqual(criteria)
  })

  it('drops the sessions of a project when they are all deleted', () => {
    applyAppMessage(server('session.deletedAll', {}, 'p'))
    expect(useApp.getState().sessions.map((s) => s.id)).toEqual(['b'])
  })

  it('marks a background session unread on progress, and never the open one', () => {
    applyAppMessage(server('chat.progress', { message: 'x' }, 'b'))
    applyAppMessage(server('chat.format_retry', { attempt: 1 }, 'b'))
    applyAppMessage(server('chat.progress', { message: 'x' }, 'a'))
    expect(useApp.getState().unreadSessions).toEqual(['b'])
  })

  it('forgets the confirmations of a deleted session', () => {
    useApp.setState({ confirmationsElsewhere: { b: ['1'], c: ['2'] } })
    applyAppMessage(server('session.deleted', { sessionId: 'b' }))
    expect(useApp.getState().confirmationsElsewhere).toEqual({ c: ['2'] })
  })

  it('forgets the confirmations of every session of a cleared project', () => {
    useApp.setState({ confirmationsElsewhere: { a: ['1'], b: ['2'] } })
    applyAppMessage(server('session.deletedAll', {}, 'p'))
    expect(useApp.getState().confirmationsElsewhere).toEqual({ b: ['2'] })
  })

  it('shows the retry countdown, then the failure', () => {
    applyAppMessage(server('chat.llm_retry', { attempt: 2, retryInMs: 4000, error: 'boom' }, 'a'))
    expect(useApp.getState().llmRetry).toEqual({ status: 'retrying', attempt: 2, retryInMs: 4000, error: 'boom' })
    applyAppMessage(server('chat.llm_retry_failed', { error: 'dead', attempts: 3 }, 'a'))
    expect(useApp.getState().llmRetry).toEqual({ status: 'failed', error: 'dead' })
  })

  it('forgets a retry in progress once the stream comes back, but keeps a failure', () => {
    applyAppMessage(server('chat.llm_retry', { attempt: 1, retryInMs: 1000, error: 'boom' }, 'a'))
    applyAppMessage(server('chat.delta', { messageId: 'm', content: 'x' }, 'a'))
    expect(useApp.getState().llmRetry).toBeNull()
    applyAppMessage(server('chat.llm_retry_failed', { error: 'dead', attempts: 3 }, 'a'))
    applyAppMessage(server('chat.delta', { messageId: 'm', content: 'x' }, 'a'))
    expect(useApp.getState().llmRetry?.status).toBe('failed')
  })

  it('stores vision fallbacks by message and attachment', () => {
    const payload = { type: 'done', messageId: 'm', attachmentId: 'f', filename: 'a.png', description: 'cat' }
    applyAppMessage(server('chat.vision_fallback', payload, 'a'))
    expect(useApp.getState().visionFallbacks['m-f']).toEqual(payload)
  })

  it('counts confirmations pending in other sessions until they resolve', () => {
    applyAppMessage(server('session.confirmation_pending', { callId: '1', paths: [] }, 'b'))
    applyAppMessage(server('session.confirmation_pending', { callId: '1', paths: [] }, 'b'))
    applyAppMessage(server('session.confirmation_pending', { callId: '2', paths: [] }, 'b'))
    expect(useApp.getState().confirmationsElsewhere).toEqual({ b: ['1', '2'] })
    applyAppMessage(server('session.confirmation_resolved', { callId: '1' }, 'b'))
    applyAppMessage(server('session.confirmation_resolved', { callId: '2' }, 'b'))
    expect(useApp.getState().confirmationsElsewhere).toEqual({})
  })
})

describe('parseLayout', () => {
  it('defaults to editor-first', () => {
    expect(parseLayout('agent-first')).toBe('agent-first')
    expect(parseLayout('')).toBe('editor-first')
    expect(parseLayout(undefined)).toBe('editor-first')
  })
})

describe('confirmationsFromServer', () => {
  it('lists the pending calls of the other sessions', () => {
    const pending = { a: [{ callId: '1' }], b: [{ callId: '2' }, { callId: '3' }], c: [] }
    expect(confirmationsFromServer(pending, 'a')).toEqual({ b: ['2', '3'] })
  })

  it('has nothing to list without server data', () => {
    expect(confirmationsFromServer(undefined, null)).toEqual({})
  })
})
