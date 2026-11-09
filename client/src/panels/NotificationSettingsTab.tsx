import { useEffect } from 'react'
import { Play } from 'lucide-react'
import type { Translation } from '@shared/i18n/index.js'
import { t } from '../i18n'
import { DEFAULT_SOUNDS, resolveEvent, type AgentColumn, type EventConfig, type SoundEvent } from '../notify/events'
import { loadNotificationSettings, saveNotificationSettings, useNotificationSettings } from '../notify/settingsStore'
import { playSound } from '../notify/startup'
import styles from './Panels.module.css'
import tabStyles from './NotificationSettings.module.css'

const SOUNDS: Array<{ url: string; label: Translation }> = [
  { url: '/sounds/notification.mp3', label: { en: 'Notification', fr: 'Notification' } },
  { url: '/sounds/waiting-for-user.mp3', label: { en: 'Waiting', fr: 'Attente' } },
  { url: '/sounds/achievement.mp3', label: { en: 'Achievement', fr: 'Réussite' } },
  { url: '/sounds/intervention.mp3', label: { en: 'Intervention', fr: 'Intervention' } },
  { url: '/sounds/typing.mp3', label: { en: 'Typing', fr: 'Frappe' } },
]

const EVENTS: Array<{ key: SoundEvent; label: Translation }> = [
  { key: 'complete', label: { en: 'Task complete', fr: 'Tâche terminée' } },
  { key: 'waiting_for_user', label: { en: 'Waiting for input', fr: 'En attente de réponse' } },
  { key: 'phase_done', label: { en: 'Phase done', fr: 'Phase terminée' } },
  { key: 'phase_blocked', label: { en: 'Phase blocked', fr: 'Phase bloquée' } },
  { key: 'new_message', label: { en: 'New message', fr: 'Nouveau message' } },
]

type Column = 'general' | Extract<AgentColumn, 'build' | 'sub-agent'>

const COLUMNS: Array<{ key: Column; label: Translation }> = [
  { key: 'general', label: { en: 'General', fr: 'Général' } },
  { key: 'build', label: { en: 'Agent', fr: 'Agent' } },
  { key: 'sub-agent', label: { en: 'Sub-agent', fr: 'Sous-agent' } },
]

const browserSupported = typeof Notification !== 'undefined'

export function NotificationSettingsTab() {
  const settings = useNotificationSettings((state) => state.settings)
  useEffect(() => {
    void loadNotificationSettings()
  }, [])

  const updateCell = (column: Column, event: SoundEvent, change: Partial<EventConfig>) => {
    if (column === 'general') {
      saveNotificationSettings({
        ...settings,
        events: { ...settings.events, [event]: { ...settings.events[event], ...change } },
      })
    } else {
      saveNotificationSettings({
        ...settings,
        agentOverrides: {
          ...settings.agentOverrides,
          [column]: {
            ...settings.agentOverrides[column],
            [event]: { ...settings.agentOverrides[column]?.[event], ...change },
          },
        },
      })
    }
  }

  const toggleBrowser = async (enabled: boolean) => {
    if (enabled && browserSupported && Notification.permission !== 'granted') {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') return
    }
    saveNotificationSettings({ ...settings, browserNotificationEnabled: enabled })
  }

  const blocked = browserSupported && Notification.permission === 'denied'

  return (
    <div className={styles.stack} data-testid="notification-settings">
      <section>
        <h3 className={styles.eyebrow}>{t({ en: 'Master controls', fr: 'Contrôles principaux' })}</h3>
        <label className={styles.toggle}>
          <input
            type="checkbox"
            data-testid="notify-sound"
            checked={settings.soundEnabled}
            onChange={(event) => saveNotificationSettings({ ...settings, soundEnabled: event.target.checked })}
          />
          <span>
            {t({ en: 'Sound notifications', fr: 'Notifications sonores' })}
            <div className={styles.muted}>
              {t({ en: 'Play sounds when events occur', fr: 'Jouer des sons lors des événements' })}
            </div>
          </span>
        </label>
        <label className={styles.toggle}>
          <input
            type="checkbox"
            data-testid="notify-browser"
            checked={settings.browserNotificationEnabled}
            disabled={!browserSupported}
            onChange={(event) => void toggleBrowser(event.target.checked)}
          />
          <span>
            {t({ en: 'Browser notifications', fr: 'Notifications du navigateur' })}
            <div className={styles.muted}>
              {t({
                en: 'Show desktop notifications when the window is not focused',
                fr: 'Afficher des notifications de bureau quand la fenêtre n’a pas le focus',
              })}
            </div>
          </span>
        </label>
        {!isSecureContext && (
          <p className={styles.muted}>
            {t({
              en: 'Browsers only allow notifications over HTTPS or on localhost.',
              fr: 'Les navigateurs n’autorisent les notifications qu’en HTTPS ou sur localhost.',
            })}
          </p>
        )}
        {blocked && (
          <p className={styles.error}>
            {t({
              en: 'Browser notifications are blocked. Please enable them in your browser settings.',
              fr: 'Les notifications du navigateur sont bloquées. Activez-les dans les paramètres de votre navigateur.',
            })}
          </p>
        )}
      </section>
      <section>
        <h3 className={styles.eyebrow}>{t({ en: 'Plugins', fr: 'Plugins' })}</h3>
        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={settings.pluginUpdateNotificationEnabled}
            onChange={(event) =>
              saveNotificationSettings({ ...settings, pluginUpdateNotificationEnabled: event.target.checked })
            }
          />
          {t({
            en: 'Notify when a plugin update is available',
            fr: 'Notifier lorsqu’une mise à jour de plugin est disponible',
          })}
        </label>
        <label className={styles.field}>
          {t({ en: 'Check for plugin updates', fr: 'Vérification des mises à jour' })}
          <select
            className={styles.select}
            value={settings.pluginUpdateCheckInterval}
            disabled={!settings.pluginUpdateNotificationEnabled}
            onChange={(event) =>
              saveNotificationSettings({
                ...settings,
                pluginUpdateCheckInterval: event.target.value as typeof settings.pluginUpdateCheckInterval,
              })
            }
          >
            <option value="1h">{t({ en: 'Every hour', fr: 'Toutes les heures' })}</option>
            <option value="6h">{t({ en: 'Every 6 hours', fr: 'Toutes les 6 heures' })}</option>
            <option value="24h">{t({ en: 'Every 24 hours', fr: 'Toutes les 24 heures' })}</option>
            <option value="startup">{t({ en: 'On OpenFox startup', fr: 'Au lancement d’OpenFox' })}</option>
          </select>
        </label>
      </section>
      <section className={tabStyles.wrap}>
        <h3 className={styles.eyebrow}>{t({ en: 'Per event', fr: 'Par événement' })}</h3>
        <table className={tabStyles.table}>
          <thead>
            <tr>
              <th>{t({ en: 'Event', fr: 'Événement' })}</th>
              {COLUMNS.map((column) => (
                <th key={column.key}>{t(column.label)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {EVENTS.map((event) => (
              <tr key={event.key} data-testid={`notify-${event.key}`}>
                <td>{t(event.label)}</td>
                {COLUMNS.map((column) => {
                  const config = resolveEvent(settings, event.key, column.key === 'general' ? undefined : column.key)
                  const url = config.customSoundUrl ?? DEFAULT_SOUNDS[event.key]
                  return (
                    <td key={column.key}>
                      <div className={tabStyles.cell}>
                        <input
                          type="checkbox"
                          title={t({ en: 'Sound', fr: 'Son' })}
                          aria-label={t({ en: 'Sound', fr: 'Son' })}
                          disabled={!settings.soundEnabled}
                          checked={config.soundEnabled}
                          onChange={(change) =>
                            updateCell(column.key, event.key, { soundEnabled: change.target.checked })
                          }
                        />
                        <input
                          type="checkbox"
                          title={t({ en: 'Browser', fr: 'Navigateur' })}
                          aria-label={t({ en: 'Browser', fr: 'Navigateur' })}
                          disabled={!settings.browserNotificationEnabled}
                          checked={config.browserNotification}
                          onChange={(change) =>
                            updateCell(column.key, event.key, { browserNotification: change.target.checked })
                          }
                        />
                        {config.soundEnabled && settings.soundEnabled && (
                          <>
                            <select
                              className={tabStyles.sound}
                              aria-label={t({ en: 'Sound file', fr: 'Fichier son' })}
                              value={url}
                              onChange={(change) =>
                                updateCell(column.key, event.key, {
                                  customSoundUrl:
                                    change.target.value === DEFAULT_SOUNDS[event.key] ? null : change.target.value,
                                })
                              }
                            >
                              {SOUNDS.map((sound) => (
                                <option key={sound.url} value={sound.url}>
                                  {t(sound.label)}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              className={tabStyles.play}
                              aria-label={t({ en: 'Play', fr: 'Écouter' })}
                              onClick={() => playSound(url)}
                            >
                              <Play size={11} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
