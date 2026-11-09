import type { ServerMessage } from '@shared/protocol.js'
import type { Message, Project, Session, SessionSummary } from '@shared/types.js'
import { TOKEN_KEY, getJson, readToken, sendJson } from './api'
import { applyCachedLocale, applyLocale } from './i18n'
import { currentRoute, navigate, subscribeRoute, type Route } from './router'
import { applyAppMessage, parseLayout, useApp, type LayoutMode } from './store/app'
import { applyServerMessage, resetFeed, setHistory } from './store/feed'
import { applyCachedTheme, applyTheme } from './theme/theme'
import {
  acceptSequenced,
  beginResume,
  endResume,
  expectAck,
  getLastEventSeq,
  handleAck,
  setLastEventSeq,
} from './transport/resume'
import { Socket } from './transport/ws'

const LAYOUT_SETTING = 'display.layoutMode'
const RESUME_TIMEOUT_MS = 10_000

interface SessionResponse {
  session: Session
  messages: Message[]
  lastEventSeq?: number
}

const socket: Socket = new Socket(onMessage, (status) => {
  useApp.setState({ connected: status === 'connected' })
  if (status === 'connected') resumeOrLoad()
})

let openSessionId: string | null = null
let openProjectId: string | null = null
let historyLoaded = false

function onMessage(message: ServerMessage): void {
  if (handleAck(message)) return
  if (!acceptSequenced(message, message.sessionId === openSessionId)) return
  applyServerMessage(message)
  applyAppMessage(message)
}

async function loadSession(sessionId: string): Promise<void> {
  historyLoaded = false
  const data = await getJson<SessionResponse>(`/api/sessions/${sessionId}`)
  if (sessionId !== openSessionId) return
  setHistory(sessionId, data.messages)
  useApp.setState({ session: data.session })
  if (data.lastEventSeq !== undefined) setLastEventSeq(sessionId, data.lastEventSeq)
  historyLoaded = true
  socket.send('session.load', { sessionId })
}

/** After a reconnect, asks only for the events missed while the socket was down. */
function resumeOrLoad(): void {
  const sessionId = openSessionId
  if (!sessionId || !historyLoaded) return
  const lastEventSeq = getLastEventSeq(sessionId)
  const requestId = lastEventSeq === undefined ? null : socket.send('session.load', { sessionId, lastEventSeq })
  if (requestId === null) {
    void loadSession(sessionId)
    return
  }
  beginResume(sessionId)
  expectAck(
    requestId,
    (payload) => {
      endResume(sessionId)
      if (payload?.['resume'] !== 'replayed') void loadSession(sessionId)
    },
    RESUME_TIMEOUT_MS,
  )
}

async function loadSessions(projectId: string): Promise<void> {
  const data = await getJson<{ sessions: SessionSummary[] }>(`/api/sessions?projectId=${projectId}&limit=50`)
  if (projectId === openProjectId) useApp.setState({ sessions: data.sessions })
}

function syncRoute(route: Route = currentRoute()): void {
  if (route.projectId !== openProjectId) {
    openProjectId = route.projectId
    useApp.setState({ sessions: [] })
    if (route.projectId) void loadSessions(route.projectId)
  }
  if (route.sessionId !== openSessionId) {
    openSessionId = route.sessionId
    historyLoaded = false
    resetFeed(route.sessionId)
    useApp.setState({ session: null, git: null, mobilePane: 'agent' })
    if (route.sessionId) void loadSession(route.sessionId)
  }
}

async function loadSettings(): Promise<void> {
  const keys = ['display.theme', LAYOUT_SETTING, 'display.locale'].join(',')
  const settings = await getJson<Record<string, string>>(`/api/settings?keys=${keys}`)
  applyTheme(settings['display.theme'])
  const locale = applyLocale(settings['display.locale'])
  useApp.setState({ locale, layout: parseLayout(settings[LAYOUT_SETTING]) })
}

async function start(): Promise<void> {
  useApp.setState({ auth: 'ready' })
  subscribeRoute(syncRoute)
  syncRoute()
  socket.connect()
  const [{ projects }, config] = await Promise.all([
    getJson<{ projects: Project[] }>('/api/projects'),
    getJson<{ version: string | null; model: string | null }>('/api/config'),
    loadSettings(),
  ])
  useApp.setState({ projects, version: config.version, model: config.model })
}

export async function boot(): Promise<void> {
  applyCachedTheme()
  useApp.setState({ locale: applyCachedLocale() })
  const auth = await getJson<{ requiresAuth: boolean }>('/api/auth')
  if (auth.requiresAuth && !readToken()) {
    useApp.setState({ auth: 'required' })
    return
  }
  await start()
}

export async function login(password: string): Promise<void> {
  const response = await sendJson('/api/auth/login', 'POST', { password })
  if (!response.ok) {
    useApp.setState({ auth: 'rejected' })
    return
  }
  const { token } = (await response.json()) as { token: string }
  localStorage.setItem(TOKEN_KEY, token)
  await start()
}

export function setLayout(layout: LayoutMode): void {
  useApp.setState({ layout })
  void sendJson(`/api/settings/${LAYOUT_SETTING}`, 'PUT', { value: layout })
}

export async function createSession(projectId: string): Promise<void> {
  const response = await sendJson('/api/sessions', 'POST', { projectId })
  if (!response.ok) return
  const { session } = (await response.json()) as { session: { id: string } }
  navigate(`/p/${projectId}/s/${session.id}`)
}
