import { create } from 'zustand'
import type { GitStatusPayload, ServerMessage, SessionCreatedPayload, SessionRunningPayload } from '@shared/protocol.js'
import type { Project, Session, SessionSummary } from '@shared/types.js'
import type { Locale } from '@shared/i18n/index.js'

export type LayoutMode = 'editor-first' | 'agent-first'
export type MobilePane = 'project' | 'agent' | 'workspace'

export interface AppState {
  auth: 'checking' | 'required' | 'rejected' | 'ready'
  connected: boolean
  locale: Locale
  layout: LayoutMode
  mobilePane: MobilePane
  projects: Project[]
  sessions: SessionSummary[]
  session: Session | null
  git: GitStatusPayload | null
  version: string | null
  model: string | null
}

export const useApp = create<AppState>(() => ({
  auth: 'checking',
  connected: false,
  locale: 'en',
  layout: 'editor-first',
  mobilePane: 'agent',
  projects: [],
  sessions: [],
  session: null,
  git: null,
  version: null,
  model: null,
}))

export function parseLayout(value: string | undefined): LayoutMode {
  return value === 'agent-first' ? 'agent-first' : 'editor-first'
}

/** The app-level effects of a server event; the feed has its own reducer. */
export function applyAppMessage(message: ServerMessage): void {
  const state = useApp.getState()
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
    case 'git.status':
      if (!message.sessionId || message.sessionId === state.session?.id) {
        useApp.setState({ git: message.payload as GitStatusPayload })
      }
      return
    default:
  }
}
