// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.stubGlobal('requestAnimationFrame', (cb: () => void) => setTimeout(cb, 0))
vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id))

const fetchMock = vi.fn(() =>
  Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }), status: 200 }),
)
vi.stubGlobal('fetch', fetchMock)
vi.stubGlobal('localStorage', {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
})

const wsState = vi.hoisted(() => ({ connected: true }))

const { wsSendMock, wsSubscribeMock, wsConnectMock, wsDisconnectMock, wsStatusMock } = vi.hoisted(() => ({
  wsSendMock: vi.fn(() => 'message-id'),
  wsSubscribeMock: vi.fn(() => () => undefined),
  wsConnectMock: vi.fn(async () => undefined),
  wsDisconnectMock: vi.fn(() => undefined),
  wsStatusMock: vi.fn(() => undefined),
}))

vi.mock('../../lib/ws', () => ({
  wsClient: {
    send: wsSendMock,
    subscribe: wsSubscribeMock,
    connect: wsConnectMock,
    disconnect: wsDisconnectMock,
    onStatusChange: wsStatusMock,
    get isConnected() {
      return wsState.connected
    },
  },
}))

vi.mock('../../lib/sound', () => ({
  playNotification: vi.fn(),
  playAchievement: vi.fn(),
  playIntervention: vi.fn(),
  playWaitingForUser: vi.fn(),
  playNewMessage: vi.fn(),
}))

type SessionStoreModule = typeof import('../session')

async function loadSessionStore(): Promise<SessionStoreModule['useSessionStore']> {
  vi.resetModules()
  const module = await import('../session')
  return module.useSessionStore
}

describe('reconnect refreshes current session content', () => {
  beforeEach(() => {
    wsSendMock.mockClear()
    wsSubscribeMock.mockClear()
    wsConnectMock.mockClear()
    wsDisconnectMock.mockClear()
    wsStatusMock.mockClear()
    fetchMock.mockClear()
  })

  it('calls loadSession when reconnecting with an active session', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const useSessionStore = await loadSessionStore()

    useSessionStore.setState({
      currentSession: {
        id: 'session-active',
        projectId: 'project-1',
        workdir: '/tmp/project-1',
        mode: 'planner',
        phase: 'plan',
        isRunning: false,
        criteria: [],
        summary: null,
      } as any,
    })

    const loadSessionSpy = vi.spyOn(useSessionStore.getState(), 'loadSession')

    await useSessionStore.getState().connect()

    vi.runAllTimers()
    vi.useRealTimers()

    const cb = (wsStatusMock.mock.calls[0] as Array<(s: string) => void>)[0]!
    ;(cb as (s: string) => void)('connected')

    expect(loadSessionSpy).toHaveBeenCalledWith('session-active')
  })

  it('loads the session once when the REST load finishes before the socket opens', async () => {
    const useSessionStore = await loadSessionStore()
    const session = {
      id: 's1',
      projectId: 'project-1',
      workdir: '/tmp/project-1',
      mode: 'planner',
      phase: 'plan',
      isRunning: true,
      criteria: [],
    }
    const json = (url: string) =>
      url.includes('/background-processes')
        ? { processes: [] }
        : url.endsWith('/api/sessions/s1')
          ? { session, messages: [], lastEventSeq: 9 }
          : { success: true }
    fetchMock.mockImplementation(((url: string) =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(json(String(url))) })) as never)
    wsState.connected = false
    try {
      await useSessionStore.getState().connect()
      const setStatus = (wsStatusMock.mock.calls[0] as unknown as [(status: string) => void])[0]

      // The page boots: the session loads over REST before the socket is open.
      await useSessionStore.getState().loadSession('s1')
      expect(wsSendMock).not.toHaveBeenCalledWith('session.load', expect.anything())

      // The socket opens: the session subscribes by resuming from the loaded
      // seq (nothing to replay) instead of being loaded over REST a second time.
      wsState.connected = true
      setStatus('connected')
      expect(wsSendMock).toHaveBeenCalledWith('session.load', { sessionId: 's1', lastEventSeq: 9 })
      const sessionLoads = (fetchMock.mock.calls as unknown as Array<[unknown]>).filter(([url]) =>
        String(url).endsWith('/api/sessions/s1'),
      )
      expect(sessionLoads).toHaveLength(1)
    } finally {
      wsState.connected = true
      fetchMock.mockReset()
      fetchMock.mockImplementation(() =>
        Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }), status: 200 }),
      )
    }
  })

  describe('resume from the last applied event', () => {
    async function connectedStore() {
      const useSessionStore = await loadSessionStore()
      useSessionStore.setState({
        currentSession: {
          id: 's1',
          projectId: 'project-1',
          workdir: '/tmp/project-1',
          mode: 'planner',
          phase: 'plan',
          isRunning: true,
          criteria: [],
          summary: null,
        } as any,
        messages: [{ id: 'm1', role: 'assistant', content: 'Hel', timestamp: '2024-01-01T00:00:00.000Z' }] as any,
        sessionStats: { totalTime: 12 } as any,
      })
      await useSessionStore.getState().connect()
      const deliver = (wsSubscribeMock.mock.calls[0] as unknown as [(message: unknown) => void])[0]
      const setStatus = (wsStatusMock.mock.calls[0] as unknown as [(status: string) => void])[0]
      const loadSessionSpy = vi.spyOn(useSessionStore.getState(), 'loadSession').mockResolvedValue(undefined)
      wsSendMock.mockImplementation(() => 'resume-request')
      return { useSessionStore, deliver, setStatus, loadSessionSpy }
    }

    const delta = (seq: number, content: string, replay?: true) => ({
      type: 'chat.delta',
      sessionId: 's1',
      seq,
      payload: { messageId: 'm1', content },
      ...(replay ? { replay } : {}),
    })

    it('replays the missed events instead of reloading the session', async () => {
      const { useSessionStore, deliver, setStatus, loadSessionSpy } = await connectedStore()
      deliver(delta(5, 'lo'))

      setStatus('connected')
      expect(wsSendMock).toHaveBeenCalledWith('session.load', { sessionId: 's1', lastEventSeq: 5 })

      // A live event racing the request is dropped: the replay contains it.
      deliver(delta(7, 'ld'))
      deliver(delta(6, ' wor', true))
      deliver(delta(7, 'ld', true))
      deliver({
        type: 'ack',
        id: 'resume-request',
        payload: {
          sessionId: 's1',
          resume: 'replayed',
          // The light resume state: no sessionStats / pendingConfirmations.
          state: {
            session: { ...useSessionStore.getState().currentSession, isRunning: false },
            queueState: [],
            pendingQuestions: [],
            activeWorkflowExecution: null,
            lastEventSeq: 7,
          },
        },
      })
      await new Promise((resolve) => setTimeout(resolve, 40))

      expect(useSessionStore.getState().messages[0]?.content).toBe('Hello world')
      expect(useSessionStore.getState().currentSession?.isRunning).toBe(false)
      expect(useSessionStore.getState().sessionStats).toEqual({ totalTime: 12 })
      expect(loadSessionSpy).not.toHaveBeenCalled()
      wsSendMock.mockReset()
      wsSendMock.mockImplementation(() => 'message-id')
    })

    it('falls back to a full reload when the server cannot replay', async () => {
      const { deliver, setStatus, loadSessionSpy } = await connectedStore()
      deliver(delta(5, 'lo'))

      setStatus('connected')
      deliver({ type: 'ack', id: 'resume-request', payload: { sessionId: 's1', resume: 'full' } })

      expect(loadSessionSpy).toHaveBeenCalledWith('s1', true)
      wsSendMock.mockReset()
      wsSendMock.mockImplementation(() => 'message-id')
    })
  })

  it('does not call loadSession when reconnecting without an active session', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const useSessionStore = await loadSessionStore()

    useSessionStore.setState({
      currentSession: null,
    })

    const loadSessionSpy = vi.spyOn(useSessionStore.getState(), 'loadSession')

    await useSessionStore.getState().connect()

    vi.runAllTimers()
    vi.useRealTimers()

    const cb = (wsStatusMock.mock.calls[0] as Array<(s: string) => void>)[0]!
    ;(cb as (s: string) => void)('connected')

    expect(loadSessionSpy).not.toHaveBeenCalled()
  })

  it('handles queue.state with undefined messages gracefully', async () => {
    const useSessionStore = await loadSessionStore()
    useSessionStore.setState({
      queuedMessages: [{ queueId: '1', content: 'test', mode: 'asap' as const, queuedAt: '2024-01-01T00:00:00.000Z' }],
    })
    expect(useSessionStore.getState().queuedMessages).toHaveLength(1)

    useSessionStore.getState().handleServerMessage({
      type: 'queue.state',
      payload: { messages: undefined as unknown as [] },
    })
    expect(useSessionStore.getState().queuedMessages).toEqual([])
  })

  it('handles queue.state with valid messages', async () => {
    const useSessionStore = await loadSessionStore()
    useSessionStore.setState({ queuedMessages: [] })

    useSessionStore.getState().handleServerMessage({
      type: 'queue.state',
      payload: {
        messages: [
          { queueId: '1', content: 'test1', mode: 'completion' as const, queuedAt: '2024-01-01T00:00:00.000Z' },
          { queueId: '2', content: 'test2', mode: 'asap' as const, queuedAt: '2024-01-01T00:00:00.000Z' },
        ],
      },
    })
    expect(useSessionStore.getState().queuedMessages).toHaveLength(2)
  })

  it('refreshes the projects resource when connection status becomes connected', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const useSessionStore = await loadSessionStore()

    const { projectsResource } = await import('../../lib/resources')
    const refreshSpy = vi.spyOn(projectsResource, 'refresh')

    await useSessionStore.getState().connect()

    vi.runAllTimers()
    vi.useRealTimers()

    const cb = (wsStatusMock.mock.calls[0] as Array<(s: string) => void>)[0]!
    ;(cb as (s: string) => void)('connected')

    expect(refreshSpy).toHaveBeenCalled()
  })

  it('refetches the active session after an automatic reconnect (reconnecting status clears the guard)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const useSessionStore = await loadSessionStore()

    fetchMock.mockImplementation(((url?: unknown) => {
      const u = String(url ?? '')
      if (u.includes('/api/sessions/session-active') && !u.includes('background-processes')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              session: {
                id: 'session-active',
                projectId: 'project-1',
                workdir: '/tmp/project-1',
                mode: 'planner',
                phase: 'plan',
                isRunning: false,
                criteria: [],
              },
              messages: [],
              hiddenCount: 0,
            }),
        })
      }
      if (u.includes('background-processes')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ processes: [] }) })
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ success: true }) })
    }) as never)

    useSessionStore.setState({
      currentSession: {
        id: 'session-active',
        projectId: 'project-1',
        workdir: '/tmp/project-1',
        mode: 'planner',
        phase: 'plan',
        isRunning: false,
        criteria: [],
        summary: null,
      } as any,
    })

    // First connect + load
    await useSessionStore.getState().connect()
    const cb = (wsStatusMock.mock.calls[0] as Array<(s: string) => void>)[0]!
    ;(cb as (s: string) => void)('connected')
    await vi.runAllTimersAsync()

    // Automatic reconnect: reconnecting clears the sequential guard
    ;(cb as (s: string) => void)('reconnecting')
    ;(cb as (s: string) => void)('connected')
    await vi.runAllTimersAsync()
    vi.useRealTimers()

    const sessionFetches = fetchMock.mock.calls.filter(
      (c) =>
        String((c as unknown[])[0]).includes('/api/sessions/session-active') &&
        !String((c as unknown[])[0]).includes('/background-processes'),
    ).length
    expect(sessionFetches).toBe(2)
  })

  it('force reload bypasses the in-flight guard', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const useSessionStore = await loadSessionStore()

    useSessionStore.setState({
      currentSession: {
        id: 'session-active',
        projectId: 'project-1',
        workdir: '/tmp/project-1',
        mode: 'planner',
        phase: 'plan',
        isRunning: false,
        criteria: [],
        summary: null,
      } as any,
    })

    // Start a normal load (no await), then force reload while it is in flight
    const loadPromise = useSessionStore.getState().loadSession('session-active')
    await useSessionStore.getState().loadSession('session-active', true)
    await loadPromise
    await vi.runAllTimersAsync()
    vi.useRealTimers()

    const sessionFetches = fetchMock.mock.calls.filter(
      (c) =>
        String((c as unknown[])[0]).includes('/api/sessions/session-active') &&
        !String((c as unknown[])[0]).includes('/background-processes'),
    ).length
    expect(sessionFetches).toBe(2)
  })
})
