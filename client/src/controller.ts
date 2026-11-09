import type { GitStatusPayload, ServerMessage } from '@shared/protocol.js'
import type { ContextState, Message, Project, Session, SessionStatsSummary, SessionSummary } from '@shared/types.js'
import type { PendingPathConfirmationPayload, PendingQuestionPayload } from '@shared/protocol.js'
import { TOKEN_KEY, getJson, readToken, sendJson } from './api'
import { applyCachedLocale, applyLocale } from './i18n'
import { currentRoute, navigate, subscribeRoute, type Route } from './router'
import {
  applyAppMessage,
  parseLayout,
  SESSION_DEFAULTS,
  useApp,
  type AgentInfo,
  type LayoutMode,
  type ProviderInfo,
  type QueuedMessage,
} from './store/app'
import { applyServerMessage, resetFeed, setHistory } from './store/feed'
import { loadTree, refreshChangedTabs, resetWorkspace } from './store/workspace'
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
  hiddenCount?: number
  sessionStats?: SessionStatsSummary | null
  contextState?: ContextState | null
  queueState?: QueuedMessage[]
  pendingConfirmations?: PendingPathConfirmationPayload[]
  pendingQuestions?: PendingQuestionPayload[]
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
  if (message.type === 'git.status' && message.sessionId === openSessionId) {
    refreshChangedTabs(message.payload as GitStatusPayload)
  }
}

async function loadSession(sessionId: string): Promise<void> {
  historyLoaded = false
  const data = await getJson<SessionResponse>(`/api/sessions/${sessionId}`)
  if (sessionId !== openSessionId) return
  setHistory(sessionId, data.messages, data.hiddenCount ?? 0)
  useApp.setState({
    session: data.session,
    stats: data.sessionStats ?? null,
    context: data.contextState ?? null,
    queue: data.queueState ?? [],
    confirmations: data.pendingConfirmations ?? [],
    questions: data.pendingQuestions ?? [],
    liveStats: null,
  })
  if (data.lastEventSeq !== undefined) setLastEventSeq(sessionId, data.lastEventSeq)
  historyLoaded = true
  socket.send('session.load', { sessionId })
  void loadAgents(data.session.workdir)
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

interface AgentsResponse {
  defaults: AgentInfo[]
  userItems: AgentInfo[]
  projectItems: AgentInfo[]
}

async function loadAgents(workdir: string): Promise<void> {
  const data = await getJson<AgentsResponse>(`/api/agents?workdir=${encodeURIComponent(workdir)}`)
  useApp.setState({
    agents: [...data.defaults, ...data.userItems, ...data.projectItems].filter((agent) => !agent.subagent),
  })
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
    resetWorkspace()
    useApp.setState({ ...SESSION_DEFAULTS, mobilePane: 'agent' })
    if (route.sessionId) {
      void loadSession(route.sessionId)
      void loadTree('')
    }
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
  const [{ projects }, config, { providers }] = await Promise.all([
    getJson<{ projects: Project[] }>('/api/projects'),
    getJson<{ version: string | null; model: string | null }>('/api/config'),
    getJson<{ providers: ProviderInfo[] }>('/api/providers'),
    loadSettings(),
  ])
  useApp.setState({ projects, providers, version: config.version, model: config.model })
}

export async function boot(): Promise<void> {
  applyCachedTheme()
  const collapsed = readCollapsed()
  useApp.setState({ locale: applyCachedLocale(), leftCollapsed: collapsed.left, rightCollapsed: collapsed.right })
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

const COLLAPSE_KEY = 'openfox:collapsed'

function readCollapsed(): { left: boolean; right: boolean } {
  try {
    const saved = JSON.parse(localStorage.getItem(COLLAPSE_KEY) ?? '{}') as { left?: boolean; right?: boolean }
    return { left: saved.left === true, right: saved.right === true }
  } catch {
    return { left: false, right: false }
  }
}

export function toggleColumn(side: 'left' | 'right'): void {
  const state = useApp.getState()
  const next = {
    left: side === 'left' ? !state.leftCollapsed : state.leftCollapsed,
    right: side === 'right' ? !state.rightCollapsed : state.rightCollapsed,
  }
  useApp.setState({ leftCollapsed: next.left, rightCollapsed: next.right })
  try {
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next))
  } catch {
    // The columns simply reopen on the next load
  }
}

export function setLayout(layout: LayoutMode): void {
  useApp.setState({ layout })
  void sendJson(`/api/settings/${LAYOUT_SETTING}`, 'PUT', { value: layout })
}

export function compactContext(): void {
  if (openSessionId) socket.send('context.compact', { sessionId: openSessionId })
}

export async function createSession(projectId: string): Promise<void> {
  const response = await sendJson('/api/sessions', 'POST', { projectId })
  if (!response.ok) return
  const { session } = (await response.json()) as { session: { id: string } }
  navigate(`/p/${projectId}/s/${session.id}`)
}
