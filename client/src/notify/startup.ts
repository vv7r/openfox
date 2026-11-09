import type { Translation } from '@shared/i18n/index.js'
import { getJson } from '../api'
import { subscribeMessages } from '../controller'
import { t } from '../i18n'
import { useApp } from '../store/app'
import {
  DEFAULT_SOUNDS,
  createEventTracker,
  isVersionNewer,
  resolveEvent,
  type AgentColumn,
  type SoundEvent,
} from './events'
import { loadNotificationSettings, useNotificationSettings } from './settingsStore'

const LAST_VERSION_KEY = 'openfox_last_version'
const PREVIOUS_VERSION_KEY = 'openfox_previous_version'
const UPDATE_PENDING_KEY = 'update_pending'
const CHANGELOG_SETTING = 'display.showChangelogOnUpdate'

const MESSAGES: Record<SoundEvent, { title: Translation; body: Translation }> = {
  complete: {
    title: { en: 'Task complete', fr: 'Tâche terminée' },
    body: { en: 'The agent has finished its work.', fr: 'L’agent a terminé son travail.' },
  },
  waiting_for_user: {
    title: { en: 'Waiting for input', fr: 'En attente de réponse' },
    body: { en: 'The agent needs your input to continue.', fr: 'L’agent a besoin de vous pour continuer.' },
  },
  phase_done: {
    title: { en: 'Phase complete', fr: 'Phase terminée' },
    body: { en: 'The phase completed successfully.', fr: 'La phase s’est terminée avec succès.' },
  },
  phase_blocked: {
    title: { en: 'Phase blocked', fr: 'Phase bloquée' },
    body: {
      en: 'The phase is blocked and needs intervention.',
      fr: 'La phase est bloquée et demande une intervention.',
    },
  },
  new_message: {
    title: { en: 'New message', fr: 'Nouveau message' },
    body: { en: 'A new assistant message is arriving.', fr: 'Un nouveau message de l’assistant arrive.' },
  },
}

const audio = new Map<string, HTMLAudioElement>()

export function playSound(url: string): void {
  let element = audio.get(url)
  if (!element) {
    element = new Audio(url)
    element.volume = 0.5
    audio.set(url, element)
  }
  element.currentTime = 0
  // Browsers refuse sound before the first interaction: nothing to do about it
  element.play().catch(() => {})
}

function notifyBrowser(event: SoundEvent): void {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted' || document.hasFocus()) return
  new Notification(t(MESSAGES[event].title), {
    body: t(MESSAGES[event].body),
    icon: '/fox.svg',
    tag: `openfox-${event}`,
  })
}

function sessionAgent(): AgentColumn {
  return useApp.getState().session?.mode === 'builder' ? 'build' : 'planner'
}

function startNotifier(): void {
  const next = createEventTracker(() => useApp.getState().session?.id)
  subscribeMessages((message) => {
    const occurrence = next(message)
    if (!occurrence) return
    const { settings } = useNotificationSettings.getState()
    const config = resolveEvent(settings, occurrence.event, occurrence.agent ?? sessionAgent())
    if (settings.soundEnabled && config.soundEnabled) {
      playSound(config.customSoundUrl ?? DEFAULT_SOUNDS[occurrence.event])
    }
    if (settings.browserNotificationEnabled && config.browserNotification) notifyBrowser(occurrence.event)
  })
}

export async function checkForUpdate(force = false): Promise<void> {
  useApp.setState((state) => ({ update: { ...state.update, status: 'checking' } }))
  try {
    const response = await fetch(`/api/auto-update/check${force ? '?force=true' : ''}`)
    if (!response.ok) throw new Error(String(response.status))
    const data = (await response.json()) as { isUpdateAvailable: boolean; current: string; latest: string }
    useApp.setState({
      update: {
        status: data.isUpdateAvailable ? 'available' : 'upToDate',
        current: data.current,
        latest: data.latest,
      },
    })
  } catch {
    useApp.setState((state) => ({ update: { ...state.update, status: 'error' } }))
  }
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // The changelog just won't open by itself next time
  }
}

async function showChangelogIfUpdated(): Promise<void> {
  const version = useApp.getState().version ?? null
  if (!version) return
  const last = read(LAST_VERSION_KEY)
  const pending = read(UPDATE_PENDING_KEY) === 'true'
  if (pending) localStorage.removeItem(UPDATE_PENDING_KEY)
  if (last && last !== version) write(PREVIOUS_VERSION_KEY, last)
  write(LAST_VERSION_KEY, version)
  if (!pending && !isVersionNewer(version, last)) return
  const settings = await getJson<Record<string, string>>(`/api/settings?keys=${CHANGELOG_SETTING}`).catch(
    () => ({}) as Record<string, string>,
  )
  if (settings[CHANGELOG_SETTING] !== 'false') useApp.setState({ appDialog: 'changelog' })
}

export function start(): void {
  void loadNotificationSettings()
  startNotifier()
  void checkForUpdate()
  void showChangelogIfUpdated()
}

export function markUpdateApplied(version: string, previous: string | null): void {
  const before = read(LAST_VERSION_KEY) ?? previous
  if (before && before !== version) write(PREVIOUS_VERSION_KEY, before)
  write('openfox_updated_to', version)
  write(UPDATE_PENDING_KEY, 'true')
}

export function changelogSince(): string | null {
  return read(PREVIOUS_VERSION_KEY)
}
