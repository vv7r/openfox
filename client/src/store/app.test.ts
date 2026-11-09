// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import type { ServerMessage } from '@shared/protocol.js'
import type { Session, SessionSummary } from '@shared/types.js'
import { applyAppMessage, parseLayout, useApp } from './app'

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

  it('adds a created session once, and removes a deleted one', () => {
    const created = server('session.created', { session: summary('c') })
    applyAppMessage(created)
    applyAppMessage(created)
    expect(useApp.getState().sessions.map((s) => s.id)).toEqual(['c', 'a', 'b'])
    applyAppMessage(server('session.deleted', { sessionId: 'a' }))
    expect(useApp.getState().sessions.map((s) => s.id)).toEqual(['c', 'b'])
  })
})

describe('parseLayout', () => {
  it('defaults to editor-first', () => {
    expect(parseLayout('agent-first')).toBe('agent-first')
    expect(parseLayout('')).toBe('editor-first')
    expect(parseLayout(undefined)).toBe('editor-first')
  })
})
