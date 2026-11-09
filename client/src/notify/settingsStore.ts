import { create } from 'zustand'
import { getJson, sendJson } from '../api'
import { DEFAULT_SETTINGS, mergeSettings, type NotificationSettings } from './events'

const SETTING_KEY = 'notification_settings'

export const useNotificationSettings = create<{ settings: NotificationSettings }>(() => ({
  settings: DEFAULT_SETTINGS,
}))

export async function loadNotificationSettings(): Promise<void> {
  const data = await getJson<Record<string, string>>(`/api/settings?keys=${SETTING_KEY}`).catch(
    () => ({}) as Record<string, string>,
  )
  const raw = data[SETTING_KEY]
  if (!raw) return
  try {
    useNotificationSettings.setState({ settings: mergeSettings(JSON.parse(raw) as Partial<NotificationSettings>) })
  } catch {
    // A corrupt value falls back to the defaults
  }
}

export function saveNotificationSettings(settings: NotificationSettings): void {
  useNotificationSettings.setState({ settings })
  void sendJson(`/api/settings/${SETTING_KEY}`, 'PUT', { value: JSON.stringify(settings) })
}
