import { create } from 'zustand'
import type {
  ChatAskUserPayload,
  ChatPathConfirmationPayload,
  ChatStatsPayload,
  ContextStatePayload,
  GitStatusPayload,
  PendingPathConfirmationPayload,
  PendingQuestionPayload,
  QueueStatePayload,
  ServerMessage,
  SessionCreatedPayload,
  SessionRunningPayload,
  SessionStatePayload,
} from '@shared/protocol.js'
import type {
  ContextState,
  MetadataEntry,
  Project,
  Session,
  SessionStatsSummary,
  SessionSummary,
  UserStepChoice,
  WorkflowExecution,
  WorkflowExecutionStatus,
  WorkflowParameter,
  WorkflowScope,
  MessageStats,
} from '@shared/types.js'
import type { Locale } from '@shared/i18n/index.js'
import type { DevServerState } from '@shared/dev-server.js'

export type AppDialog = 'update' | 'changelog' | 'new-project'

export type LayoutMode = 'editor-first' | 'agent-first'
export type MobilePane = 'project' | 'agent' | 'workspace'
export type QueuedMessage = NonNullable<QueueStatePayload['messages']>[number]
export type LiveTurnStats = ChatStatsPayload['stats']

export interface AppState {
  auth: 'checking' | 'required' | 'rejected' | 'ready'
  connected: boolean
  locale: Locale
  layout: LayoutMode
  leftCollapsed: boolean
  rightCollapsed: boolean
  mobilePane: MobilePane
  projects: Project[]
  sessions: SessionSummary[]
  session: Session | null
  git: GitStatusPayload | null
  version: string | null
  model: string | null
  context: ContextState | null
  stats: SessionStatsSummary | null
  liveStats: LiveTurnStats | null
  confirmations: PendingPathConfirmationPayload[]
  questions: PendingQuestionPayload[]
  queue: QueuedMessage[]
  chatError: string | null
  agents: AgentInfo[]
  providers: ProviderInfo[]
  commands: NamedItem[]
  workflows: NamedItem[]
  skills: NamedItem[]
  autoLaunched: TaskAutoLaunch | null
  runningTasks: number
  update: UpdateInfo
  appDialog: AppDialog | null
  /** Folder new projects are created in. */
  projectsRoot: string | null
  agentDialog: AgentDialog | null
  sessionsHasMore: boolean
  execution: WorkflowExecution | null
  panel: PanelId | null
  display: Record<string, string>
  unreadNotifications: number
  requiresAuth: boolean
  settingsTab: string | null
  /** At least one connected MCP server is on for the open session. */
  mcpActive: boolean
  devServerState: DevServerState
  /** The item a settings tab should open straight into. */
  settingsEdit: { id: string; scope?: WorkflowScope } | null
}

export type PanelId = 'tasks' | 'git' | 'processes' | 'mcp' | 'notifications' | 'settings'

export interface UpdateInfo {
  status: 'idle' | 'checking' | 'upToDate' | 'available' | 'error'
  current: string | null
  latest: string | null
}

export type AgentDialog = { kind: 'search' } | { kind: 'turn-stats'; stats: MessageStats }

export interface TaskAutoLaunch {
  taskId: string
  taskTitle: string
  sessionId: string
  projectId: string
}

export interface NamedItem {
  id: string
  name: string
  description?: string
  color?: string
  /** Workflows declare their parameters, commands only name them. */
  parameters?: WorkflowParameter[]
  paramNames?: string[]
  /** Workflows only: the same id can exist in several scopes. */
  scope?: WorkflowScope
  subGroups?: string[]
  startCondition?: { type: string }
}

export interface AgentInfo {
  id: string
  name: string
  color?: string
  subagent?: boolean
}

export interface ProviderInfo {
  id: string
  name: string
  models: Array<{ id: string; reasoningEfforts?: string[]; supportsVision?: boolean }>
  isActive?: boolean
  url?: string
  status?: string
}

export const SESSION_DEFAULTS = {
  session: null,
  git: null,
  context: null,
  stats: null,
  liveStats: null,
  confirmations: [],
  questions: [],
  queue: [],
  chatError: null,
  execution: null,
  agentDialog: null,
  mcpActive: false,
  devServerState: 'off',
} satisfies Partial<AppState>

export const useApp = create<AppState>(() => ({
  auth: 'checking',
  connected: false,
  locale: 'en',
  layout: 'editor-first',
  leftCollapsed: false,
  rightCollapsed: false,
  mobilePane: 'agent',
  projects: [],
  sessions: [],
  version: null,
  model: null,
  agents: [],
  providers: [],
  commands: [],
  workflows: [],
  skills: [],
  autoLaunched: null,
  runningTasks: 0,
  update: { status: 'idle', current: null, latest: null },
  appDialog: null,
  projectsRoot: null,
  sessionsHasMore: false,
  panel: null,
  display: {},
  unreadNotifications: 0,
  requiresAuth: false,
  settingsTab: null,
  settingsEdit: null,
  ...SESSION_DEFAULTS,
}))

export function parseLayout(value: string | undefined): LayoutMode {
  return value === 'agent-first' ? 'agent-first' : 'editor-first'
}

function updateSession(state: AppState, sessionId: string | undefined, patch: Partial<Session>): void {
  if (state.session && state.session.id === sessionId) useApp.setState({ session: { ...state.session, ...patch } })
}

function upsertByCallId<T extends { callId: string }>(list: T[], item: T): T[] {
  return [...list.filter((entry) => entry.callId !== item.callId), item]
}

/** The app-level effects of a server event; the feed has its own reducer. */
export function applyAppMessage(message: ServerMessage): void {
  const state = useApp.getState()
  const isOpen = state.session?.id === message.sessionId
  switch (message.type) {
    case 'session.running': {
      const { isRunning } = message.payload as SessionRunningPayload
      const { session } = state
      useApp.setState({
        sessions: state.sessions.map((s) => (s.id === message.sessionId ? { ...s, isRunning } : s)),
        session: session && session.id === message.sessionId ? { ...session, isRunning } : session,
      })
      return
    }
    case 'session.state': {
      const payload = message.payload as SessionStatePayload
      if (state.session?.id !== payload.session.id) return
      useApp.setState({
        session: payload.session,
        confirmations: payload.pendingConfirmations ?? [],
        questions: payload.pendingQuestions ?? [],
        ...(payload.sessionStats ? { stats: payload.sessionStats } : {}),
        liveStats: null,
      })
      return
    }
    case 'session.created': {
      const { session } = message.payload as SessionCreatedPayload
      if (session.projectId !== state.session?.projectId && session.projectId !== state.sessions[0]?.projectId) return
      if (state.sessions.some((s) => s.id === session.id)) return
      useApp.setState({ sessions: [session as unknown as SessionSummary, ...state.sessions] })
      return
    }
    case 'session.deleted': {
      const { sessionId } = message.payload as { sessionId: string }
      useApp.setState({ sessions: state.sessions.filter((s) => s.id !== sessionId) })
      return
    }
    case 'session.name_generated': {
      const { name } = message.payload as { name: string }
      useApp.setState({ sessions: state.sessions.map((s) => (s.id === message.sessionId ? { ...s, title: name } : s)) })
      if (isOpen && state.session)
        updateSession(state, message.sessionId, { metadata: { ...state.session.metadata, title: name } })
      return
    }
    case 'git.status':
      if (!message.sessionId || isOpen) useApp.setState({ git: message.payload as GitStatusPayload })
      return
    case 'context.state': {
      const payload = message.payload as ContextStatePayload
      if (isOpen && !payload.subAgentId) useApp.setState({ context: payload.context })
      return
    }
    case 'chat.stats':
      if (isOpen) useApp.setState({ liveStats: (message.payload as ChatStatsPayload).stats })
      return
    case 'chat.done': {
      const payload = message.payload as { agentType?: string; reason: string }
      if (isOpen && !payload.agentType && payload.reason !== 'waiting_for_user') useApp.setState({ liveStats: null })
      return
    }
    case 'chat.error':
      if (isOpen) useApp.setState({ chatError: (message.payload as { error: string }).error })
      return
    case 'chat.message':
      if (isOpen && state.chatError) useApp.setState({ chatError: null })
      return
    case 'mode.changed': {
      const { mode } = message.payload as { mode: Session['mode'] }
      updateSession(state, message.sessionId, { mode })
      return
    }
    case 'metadata.updated': {
      const { key, entries } = message.payload as { key: string; entries: MetadataEntry[] }
      if (isOpen && state.session) {
        updateSession(state, message.sessionId, {
          metadataEntries: { ...state.session.metadataEntries, [key]: entries },
        })
      }
      return
    }
    case 'chat.path_confirmation':
    case 'session.confirmation_pending': {
      const payload = message.payload as ChatPathConfirmationPayload
      if (isOpen)
        useApp.setState({
          confirmations: upsertByCallId(state.confirmations, payload as PendingPathConfirmationPayload),
        })
      return
    }
    case 'session.confirmation_resolved': {
      const { callId } = message.payload as { callId: string }
      if (isOpen) useApp.setState({ confirmations: state.confirmations.filter((c) => c.callId !== callId) })
      return
    }
    case 'chat.ask_user': {
      const payload = message.payload as ChatAskUserPayload
      if (isOpen) useApp.setState({ questions: upsertByCallId(state.questions, payload as PendingQuestionPayload) })
      return
    }
    case 'workflow.execution_changed': {
      if (!isOpen) return
      const payload = message.payload as {
        executionId: string
        workflowId: string
        workflowName: string
        workflowColor?: string
        status: WorkflowExecutionStatus
        currentStepId?: string
        currentStepName?: string
        pendingChoices?: UserStepChoice[]
      }
      const base: WorkflowExecution = state.execution ?? {
        id: payload.executionId,
        sessionId: message.sessionId ?? '',
        workflowId: payload.workflowId,
        workflowName: payload.workflowName,
        status: payload.status,
        stepOutput: {},
        params: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      useApp.setState({
        execution: {
          ...base,
          status: payload.status,
          ...(payload.currentStepId ? { currentStepId: payload.currentStepId } : {}),
          ...(payload.currentStepName ? { currentStepName: payload.currentStepName } : {}),
          ...(payload.pendingChoices ? { pendingChoices: payload.pendingChoices } : {}),
        },
      })
      return
    }
    case 'queue.state':
      if (isOpen) useApp.setState({ queue: (message.payload as QueueStatePayload).messages ?? [] })
      return
    default:
  }
}
