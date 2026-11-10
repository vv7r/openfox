import type {
  ChatToolResultPayload,
  ClientMessageType,
  ContextPreviewPayload,
  GitStatusPayload,
  ServerMessage,
  TasksUpdatePayload,
} from '@shared/protocol.js'
import type {
  ContextState,
  Message,
  Project,
  Session,
  SessionStatsSummary,
  SessionSummary,
  WorkflowExecution,
} from '@shared/types.js'
import type { DevServerStatus } from '@shared/dev-server.js'
import type { DevServerStatePayload, PendingPathConfirmationPayload, PendingQuestionPayload } from '@shared/protocol.js'
import { TOKEN_KEY, getJson, readToken, sendJson } from './api'
import { applyCachedLocale, applyLocale } from './i18n'
import { currentRoute, mobilePaneFor, navigate, subscribeRoute, type Route } from './router'
import {
  applyAppMessage,
  confirmationsFromServer,
  markSessionSeen,
  parseLayout,
  SESSION_DEFAULTS,
  useApp,
  type AgentInfo,
  type LayoutMode,
  type NamedItem,
  type PanelId,
  type ProviderInfo,
  type QueuedMessage,
  type AppState,
} from './store/app'
import { applyServerMessage, resetFeed, setHistory, setMaxFeedItems, useFeed } from './store/feed'
import { setHighlighting } from './markdown/cache'
import { isWriteCall } from './feed/agentFiles'
import { hasActiveMcp } from './shell/railStatus'
import { leaveWorkspace, loadTree, refreshAfterAgentWrite, refreshChangedTabs } from './store/workspace'
import { SYSTEM_PREFS_KEY, USER_PRESETS_KEY, applyCachedTheme, applyTheme, applyThemeLibrary } from './theme/theme'
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
import { handlePluginMessage, loadPlugins } from './plugins/store'

const LAYOUT_SETTING = 'display.layoutMode'
const FEED_DISPLAY_KEYS = [
  'display.showThinking',
  'display.showVerboseToolOutput',
  'display.showStats',
  'display.showAgentDefinitions',
  'display.showWorkflowBars',
  'display.showToolCallStreaming',
  'display.collapseLargeToolCalls',
  'display.showOpenInEditorLinks',
  'editor.vscodeRemotePrefix',
  'display.showSyntaxHighlighting',
  'display.maxVisibleItems',
  'display.mobileFullscreenComposer',
  'display.modelSelectorHeight',
  'display.collapseProvidersByDefault',
  'display.collapseFavoritesByDefault',
  'display.modelFavorites',
  'display.showProjectsAboveSessions',
  'display.fullscreenSlashCommand',
  'display.dangerLevelDisplayMode',
  'display.dangerLevelAutoList',
  'display.dangerLevelAutoListThreshold',
]
const RESUME_TIMEOUT_MS = 10_000

interface SessionResponse {
  session: Session
  messages: Message[]
  lastEventSeq?: number
  hiddenCount?: number
  sessionStats?: SessionStatsSummary | null
  contextState?: ContextState | null
  queueState?: QueuedMessage[]
  activeWorkflowExecution?: WorkflowExecution | null
  pendingConfirmations?: PendingPathConfirmationPayload[]
  pendingQuestions?: PendingQuestionPayload[]
}

const socket: Socket = new Socket(onMessage, (status) => {
  useApp.setState({ connected: status === 'connected' })
  if (status === 'connected') resumeOrLoad()
})

let openSessionId: string | null = null
let openProjectId: string | null = null
let openWorkspace: string | null = null
let historyLoaded = false

function onMessage(message: ServerMessage): void {
  if (handleAck(message)) return
  if (!acceptSequenced(message, message.sessionId === openSessionId)) return
  applyServerMessage(message)
  applyAppMessage(message)
  handlePluginMessage(message)
  messageListeners.forEach((listener) => listener(message))
  if (message.type === 'tasks.update') {
    const { autoLaunched, counts, projectId } = message.payload as TasksUpdatePayload
    if (autoLaunched) useApp.setState({ autoLaunched })
    if (projectId === openProjectId) useApp.setState({ runningTasks: counts.running })
  }
  if (
    message.type === 'session.running' &&
    !(message.payload as { isRunning: boolean }).isRunning &&
    message.sessionId !== openSessionId &&
    openProjectId
  )
    void refreshConfirmations(openProjectId).catch(() => {})
  if (message.type === 'session.deletedAll' && message.sessionId === openProjectId) {
    void loadSessions(message.sessionId)
    if (openSessionId) navigate(`/p/${message.sessionId}`)
  }
  if (message.type === 'mcp.servers.changed' && openSessionId) void loadMcpStatus(openSessionId).catch(() => {})
  if (message.type === 'devServer.state') {
    const { workdir, state } = message.payload as DevServerStatePayload
    const session = useApp.getState().session
    if (session && workdir === (session.workspace ?? session.workdir)) useApp.setState({ devServerState: state })
  }
  if (message.type === 'git.status' && message.sessionId === openSessionId) {
    refreshChangedTabs(message.payload as GitStatusPayload)
  }
  if (
    message.type === 'chat.tool_result' &&
    message.sessionId === openSessionId &&
    isWriteCall(
      useFeed.getState(),
      (message.payload as ChatToolResultPayload).messageId,
      (message.payload as ChatToolResultPayload).callId,
    )
  ) {
    refreshAfterAgentWrite()
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
    execution: data.activeWorkflowExecution ?? null,
    confirmations: data.pendingConfirmations ?? [],
    questions: data.pendingQuestions ?? [],
    liveStats: null,
  })
  if (data.lastEventSeq !== undefined) setLastEventSeq(sessionId, data.lastEventSeq)
  historyLoaded = true
  socket.send('session.load', { sessionId })
  void loadAgents(data.session.workdir)
  loadRailStatus(sessionId, data.session.workspace ?? data.session.workdir)
}

async function loadMcpStatus(sessionId: string): Promise<void> {
  const [{ servers }, { disabledServers }] = await Promise.all([
    getJson<{ servers: Array<{ name: string; status: string }> }>('/api/mcp/servers'),
    getJson<{ disabledServers: string[] }>(`/api/sessions/${sessionId}/mcp/overrides`),
  ])
  if (sessionId === openSessionId)
    useApp.setState({
      mcpActive: hasActiveMcp(servers, disabledServers),
      mcpServers: servers.map((server) => server.name),
    })
}

async function loadDevServerState(sessionId: string, workdir: string): Promise<void> {
  const { state } = await getJson<DevServerStatus>(`/api/dev-server?workdir=${encodeURIComponent(workdir)}`)
  if (sessionId === openSessionId) useApp.setState({ devServerState: state })
}

/** Only colours two icons: a failed read leaves them as they were. */
function loadRailStatus(sessionId: string, workdir: string): void {
  void loadMcpStatus(sessionId).catch(() => {})
  void loadDevServerState(sessionId, workdir).catch(() => {})
}

/** After a reconnect, asks only for the events missed while the socket was down. */
function resumeOrLoad(): void {
  const sessionId = openSessionId
  if (!sessionId || !historyLoaded) return
  const session = useApp.getState().session
  if (session) loadRailStatus(sessionId, session.workspace ?? session.workdir)
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
  useApp.setState({ agents: flatten(data as unknown as NamedLists).filter((agent) => !(agent as AgentInfo).subagent) })
  const query = `?workdir=${encodeURIComponent(workdir)}`
  const [commands, workflows, skills] = await Promise.all([
    getJson<NamedLists>(`/api/commands${query}`),
    getJson<NamedLists>(`/api/workflows${query}`),
    getJson<SkillLists>(`/api/skills${query}`),
  ])
  useApp.setState({
    commands: flatten(commands),
    workflows: flatten(workflows),
    skills: (skills.items.length > 0 ? skills.items : flatten(skills)).filter((skill) => skill.enabled),
  })
}

interface NamedLists {
  defaults: NamedItem[]
  userItems: NamedItem[]
  projectItems: NamedItem[]
}

type SkillItem = NamedItem & { enabled?: boolean }

interface SkillLists {
  items: SkillItem[]
  defaults: SkillItem[]
  userItems: SkillItem[]
  projectItems: SkillItem[]
}

function flatten<T extends NamedItem>(lists: { defaults: T[]; userItems: T[]; projectItems: T[] }): T[] {
  return [...lists.defaults, ...lists.userItems, ...lists.projectItems]
}

async function loadRunningTasks(projectId: string): Promise<void> {
  const { counts } = await getJson<{ counts: { running: number } }>(`/api/projects/${projectId}/tasks/count`)
  if (projectId === openProjectId) useApp.setState({ runningTasks: counts.running })
}

interface SessionsPage {
  sessions: SessionSummary[]
  hasMore: boolean
  pendingConfirmationsBySession?: Record<string, Array<{ callId: string }>>
}

const fetchSessions = (projectId: string) => getJson<SessionsPage>(`/api/sessions?projectId=${projectId}&limit=50`)

async function loadSessions(projectId: string): Promise<void> {
  const data = await fetchSessions(projectId)
  if (projectId !== openProjectId) return
  useApp.setState({
    sessions: data.sessions,
    sessionsHasMore: data.hasMore,
    confirmationsElsewhere: confirmationsFromServer(data.pendingConfirmationsBySession, openSessionId),
  })
}

/** Cancelled confirmations send no event: a finished turn is the cue to ask the server. */
async function refreshConfirmations(projectId: string): Promise<void> {
  const data = await fetchSessions(projectId)
  if (projectId !== openProjectId) return
  useApp.setState({
    confirmationsElsewhere: confirmationsFromServer(data.pendingConfirmationsBySession, openSessionId),
  })
}

let routeSynced = false

function syncRoute(route: Route = currentRoute()): void {
  if (route.projectId !== openProjectId || route.sessionId !== openSessionId)
    useApp.setState({ mobilePane: mobilePaneFor(route) })
  if (route.projectId !== openProjectId) {
    openProjectId = route.projectId
    useApp.setState({ sessions: [], runningTasks: 0, confirmationsElsewhere: {} })
    if (route.projectId) {
      void loadSessions(route.projectId)
      void loadRunningTasks(route.projectId).catch(() => {})
    }
  }
  if (route.sessionId !== openSessionId) {
    if (route.sessionId && routeSynced) foldLeftColumn()
    openSessionId = route.sessionId
    historyLoaded = false
    resetFeed(route.sessionId)
    useApp.setState(SESSION_DEFAULTS)
    if (route.sessionId) {
      markSessionSeen(route.sessionId)
      void loadSession(route.sessionId)
    }
  }
  const workspace = route.sessionId ?? route.projectId
  if (workspace !== openWorkspace) {
    openWorkspace = workspace
    leaveWorkspace()
    if (workspace) void loadTree('')
  }
  routeSynced = true
}

function applyFeedDisplay(values: Record<string, string | undefined>): void {
  setMaxFeedItems(Number(values['display.maxVisibleItems'] ?? 0))
  setHighlighting(values['display.showSyntaxHighlighting'] !== 'false')
}

async function loadSettings(): Promise<void> {
  const keys = [
    'display.theme',
    USER_PRESETS_KEY,
    SYSTEM_PREFS_KEY,
    LAYOUT_SETTING,
    'display.locale',
    ...FEED_DISPLAY_KEYS,
  ].join(',')
  const settings = await getJson<Record<string, string>>(`/api/settings?keys=${keys}`)
  applyThemeLibrary(settings[USER_PRESETS_KEY], settings[SYSTEM_PREFS_KEY])
  applyTheme(settings['display.theme'])
  const locale = applyLocale(settings['display.locale'])
  useApp.setState({
    locale,
    layout: parseLayout(settings[LAYOUT_SETTING]),
    display: Object.fromEntries(FEED_DISPLAY_KEYS.map((key) => [key, settings[key] ?? ''])),
  })
  applyFeedDisplay(settings)
}

async function start(): Promise<void> {
  useApp.setState({ auth: 'ready' })
  subscribeRoute(syncRoute)
  syncRoute()
  socket.connect()
  void loadPlugins().catch(() => {})
  void getJson<{ unreadCount: number }>('/api/notifications').then(({ unreadCount }) =>
    useApp.setState({ unreadNotifications: unreadCount }),
  )
  const [{ projects }, config, { providers }] = await Promise.all([
    getJson<{ projects: Project[] }>('/api/projects'),
    getJson<{ version: string | null; model: string | null; workdir: string }>('/api/config'),
    getJson<{ providers: ProviderInfo[] }>('/api/providers'),
    loadSettings(),
  ])
  useApp.setState({ projects, providers, version: config.version, model: config.model, projectsRoot: config.workdir })
  if (providers.length === 0 && location.pathname !== '/onboarding') navigate('/onboarding')
  void import('./notify/startup').then((module) => module.start())
}

export async function boot(): Promise<void> {
  applyCachedTheme()
  const collapsed = readCollapsed()
  useApp.setState({ locale: applyCachedLocale(), leftCollapsed: collapsed.left, rightCollapsed: collapsed.right })
  const auth = await getJson<{ requiresAuth: boolean }>('/api/auth')
  useApp.setState({ requiresAuth: auth.requiresAuth })
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

function setColumns(next: { left: boolean; right: boolean }): void {
  useApp.setState({ leftCollapsed: next.left, rightCollapsed: next.right })
  try {
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next))
  } catch {
    // The columns simply reopen on the next load
  }
}

export function toggleColumn(side: 'left' | 'right'): void {
  const state = useApp.getState()
  setColumns({
    left: side === 'left' ? !state.leftCollapsed : state.leftCollapsed,
    right: side === 'right' ? !state.rightCollapsed : state.rightCollapsed,
  })
}

/** A session opened from the list gets the room; a reload keeps the columns as they were. */
function foldLeftColumn(): void {
  setColumns({ left: true, right: useApp.getState().rightCollapsed })
}

export function revealOpenSession(): void {
  foldLeftColumn()
  useApp.setState({ mobilePane: 'agent' })
}

/** The home page lists projects on the left and has no use for the files. */
export const showHomeColumns = (): void => setColumns({ left: false, right: true })

/** Projects are named in the left panel, which only lists them on the home page. */
export function startNewProject(): void {
  showHomeColumns()
  // After navigating: opening another route puts the phone back on the agent pane
  navigate('/')
  useApp.setState({ creatingProject: true, mobilePane: 'project' })
}

export function setLayout(layout: LayoutMode): void {
  useApp.setState({ layout })
  void sendJson(`/api/settings/${LAYOUT_SETTING}`, 'PUT', { value: layout })
}

export function compactContext(): void {
  if (openSessionId) socket.send('context.compact', { sessionId: openSessionId })
}

export function applyDynamicContext(): void {
  if (openSessionId) socket.send('context.applyDynamic', { sessionId: openSessionId })
}

const PREVIEW_TIMEOUT_MS = 5000

/** What applying the dynamic context would change; null if the server does not answer. */
export function previewDynamicContext(): Promise<ContextPreviewPayload | null> {
  return new Promise((done) => {
    const requestId = openSessionId && socket.send('context.applyDynamic.preview', { sessionId: openSessionId })
    if (!requestId) {
      done(null)
      return
    }
    const finish = (preview: ContextPreviewPayload | null) => {
      clearTimeout(timer)
      stop()
      done(preview)
    }
    const timer = setTimeout(() => finish(null), PREVIEW_TIMEOUT_MS)
    const stop = subscribeMessages((message) => {
      if (message.id === requestId && message.type === 'context.preview') {
        finish(message.payload as ContextPreviewPayload)
      }
    })
  })
}

export async function createSession(projectId: string): Promise<void> {
  const response = await sendJson('/api/sessions', 'POST', { projectId })
  if (!response.ok) return
  const { session } = (await response.json()) as { session: { id: string } }
  navigate(`/p/${projectId}/s/${session.id}`)
}

type MessageListener = (message: ServerMessage) => void
const messageListeners = new Set<MessageListener>()

/** Lets lazy panels (terminal) hear server events without passing through the stores. */
export function subscribeMessages(listener: MessageListener): () => void {
  messageListeners.add(listener)
  return () => messageListeners.delete(listener)
}

export const reconnectNow = (): void => socket.reconnect()

export function sendOverSocket(type: string, payload: unknown): boolean {
  return socket.send(type as ClientMessageType, payload) !== null
}

export async function loadMoreSessions(): Promise<void> {
  const { sessions } = useApp.getState()
  if (!openProjectId) return
  const projectId = openProjectId
  const data = await getJson<{ sessions: SessionSummary[]; hasMore: boolean }>(
    `/api/sessions?projectId=${projectId}&limit=50&offset=${sessions.length}`,
  )
  if (projectId !== openProjectId) return
  const known = new Set(sessions.map((s) => s.id))
  useApp.setState({
    sessions: [...sessions, ...data.sessions.filter((s) => !known.has(s.id))],
    sessionsHasMore: data.hasMore,
  })
}

export const reloadSessions = (): Promise<void> => (openProjectId ? loadSessions(openProjectId) : Promise.resolve())

export async function reloadProjects(): Promise<void> {
  const { projects } = await getJson<{ projects: Project[] }>('/api/projects')
  useApp.setState({ projects })
}

export async function saveSetting(key: string, value: string): Promise<void> {
  await sendJson(`/api/settings/${key}`, 'PUT', { value })
  if (FEED_DISPLAY_KEYS.includes(key)) {
    useApp.setState((state) => ({ display: { ...state.display, [key]: value } }))
    applyFeedDisplay(useApp.getState().display)
  }
}

export const reloadOpenSession = (): Promise<void> => (openSessionId ? loadSession(openSessionId) : Promise.resolve())

/** Agents, commands and workflows changed: refresh what the composer offers. */
export async function reloadLibrary(): Promise<void> {
  const workdir = useApp.getState().session?.workdir
  if (workdir) await loadAgents(workdir)
}

export async function reloadProviders(): Promise<void> {
  const { providers } = await getJson<{ providers: ProviderInfo[] }>('/api/providers')
  useApp.setState({ providers })
}

export function logout(): void {
  localStorage.removeItem(TOKEN_KEY)
  location.href = '/'
}

export function openPanel(panel: PanelId | null): void {
  useApp.setState({ panel })
}

export const reloadSessionLists = async (): Promise<void> => {
  const workdir = useApp.getState().session?.workdir
  if (workdir) await loadAgents(workdir)
}

export function showSettings(tab?: string, edit?: AppState['settingsEdit']): void {
  useApp.setState({ panel: 'settings', settingsTab: tab ?? null, settingsEdit: edit ?? null })
}
