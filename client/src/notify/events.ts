import type { ChatDonePayload, PhaseChangedPayload, ServerMessage } from '@shared/protocol.js'

export type SoundEvent = 'complete' | 'waiting_for_user' | 'phase_done' | 'phase_blocked' | 'new_message'
export type AgentColumn = 'planner' | 'build' | 'sub-agent'
export type PluginUpdateInterval = '1h' | '6h' | '24h' | 'startup'

export interface EventConfig {
  soundEnabled: boolean
  browserNotification: boolean
  customSoundUrl: string | null
}

export interface NotificationSettings {
  soundEnabled: boolean
  browserNotificationEnabled: boolean
  pluginUpdateNotificationEnabled: boolean
  pluginUpdateCheckInterval: PluginUpdateInterval
  events: Record<SoundEvent, EventConfig>
  agentOverrides: Partial<Record<AgentColumn, Partial<Record<SoundEvent, Partial<EventConfig>>>>>
}

export const DEFAULT_SOUNDS: Record<SoundEvent, string> = {
  complete: '/sounds/notification.mp3',
  waiting_for_user: '/sounds/waiting-for-user.mp3',
  phase_done: '/sounds/achievement.mp3',
  phase_blocked: '/sounds/intervention.mp3',
  new_message: '/sounds/typing.mp3',
}

const ON: EventConfig = { soundEnabled: true, browserNotification: false, customSoundUrl: null }
const OFF: EventConfig = { soundEnabled: false, browserNotification: false, customSoundUrl: null }

export const DEFAULT_SETTINGS: NotificationSettings = {
  soundEnabled: true,
  browserNotificationEnabled: false,
  pluginUpdateNotificationEnabled: true,
  pluginUpdateCheckInterval: '1h',
  events: { complete: ON, waiting_for_user: ON, phase_done: ON, phase_blocked: ON, new_message: OFF },
  agentOverrides: {},
}

export function mergeSettings(stored: Partial<NotificationSettings>): NotificationSettings {
  const event = (name: SoundEvent) => ({ ...DEFAULT_SETTINGS.events[name], ...stored.events?.[name] })
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    events: {
      complete: event('complete'),
      waiting_for_user: event('waiting_for_user'),
      phase_done: event('phase_done'),
      phase_blocked: event('phase_blocked'),
      new_message: event('new_message'),
    },
    agentOverrides: stored.agentOverrides ?? {},
  }
}

export function resolveEvent(settings: NotificationSettings, event: SoundEvent, agent?: AgentColumn): EventConfig {
  const base = settings.events[event]
  const override = agent && settings.agentOverrides[agent]?.[event]
  return override ? { ...base, ...override } : base
}

export interface Occurrence {
  event: SoundEvent
  agent?: AgentColumn
}

const MAX_REMEMBERED_MESSAGES = 500

/** Turns server messages into notifications, remembering what already fired. */
export function createEventTracker(activeSession: () => string | undefined) {
  const phases = new Map<string, string>()
  const started = new Set<string>()

  return (message: ServerMessage): Occurrence | null => {
    switch (message.type) {
      case 'chat.done': {
        const { reason, agentType } = message.payload as ChatDonePayload & { agentType?: AgentColumn }
        if (reason !== 'complete' && reason !== 'waiting_for_user') return null
        return { event: reason, ...(agentType ? { agent: agentType } : {}) }
      }
      case 'chat.path_confirmation':
      case 'session.confirmation_pending':
        return { event: 'waiting_for_user' }
      case 'task.completed':
        return { event: 'phase_done' }
      case 'phase.changed': {
        const { phase } = message.payload as PhaseChangedPayload
        const id = message.sessionId ?? ''
        const changed = phases.get(id) !== phase
        phases.set(id, phase)
        return changed && phase === 'blocked' ? { event: 'phase_blocked' } : null
      }
      case 'chat.delta': {
        if (message.sessionId !== activeSession()) return null
        const { messageId, subAgentType } = message.payload as { messageId: string; subAgentType?: string }
        if (started.has(messageId)) return null
        started.add(messageId)
        if (started.size > MAX_REMEMBERED_MESSAGES) started.delete(started.values().next().value as string)
        return { event: 'new_message', ...(subAgentType ? { agent: 'sub-agent' as const } : {}) }
      }
      default:
        return null
    }
  }
}

const RELEASE = /^\d+\.\d+\.\d+$/

export function isVersionNewer(a: string | null, b: string | null): boolean {
  if (!a || !b || !RELEASE.test(a) || !RELEASE.test(b)) return false
  const left = a.split('.').map(Number)
  const right = b.split('.').map(Number)
  for (let index = 0; index < 3; index++) {
    if (left[index] !== right[index]) return left[index]! > right[index]!
  }
  return false
}
