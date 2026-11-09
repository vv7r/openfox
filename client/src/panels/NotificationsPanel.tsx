import { useCallback, useEffect } from 'react'
import { Trash2 } from 'lucide-react'
import type { Translation } from '@shared/i18n/index.js'
import { authFetch, getJson, sendJson } from '../api'
import { useLoad, useServerEvents } from '../hooks'
import { t } from '../i18n'
import { useApp } from '../store/app'
import styles from './Panels.module.css'

interface Notification {
  id: string
  title: Translation
  body?: Translation
  level?: string
  createdAt: string
  readAt?: string | null
}

export function NotificationsPanel() {
  const { data, reload } = useLoad(
    () => getJson<{ notifications: Notification[] }>('/api/notifications'),
    'notifications',
  )
  useServerEvents(['plugin.notification'], useCallback(reload, [reload]))

  useEffect(() => {
    useApp.setState({ unreadNotifications: 0 })
    void sendJson('/api/notifications/read', 'POST', { all: true })
  }, [])

  const remove = async (id?: string) => {
    await authFetch(id ? `/api/notifications/${encodeURIComponent(id)}` : '/api/notifications', { method: 'DELETE' })
    reload()
  }

  const notifications = data?.notifications ?? []
  return (
    <div className={styles.stack}>
      {notifications.length > 0 && (
        <button type="button" className={styles.link} onClick={() => void remove()}>
          {t({ en: 'Delete all', fr: 'Tout supprimer' })}
        </button>
      )}
      <ul className={styles.list}>
        {notifications.map((notification) => (
          <li key={notification.id}>
            <span className={styles.grow}>
              <strong>{t(notification.title)}</strong>
              {notification.body && <div className={styles.muted}>{t(notification.body)}</div>}
            </span>
            <button
              type="button"
              aria-label={t({ en: 'Delete', fr: 'Supprimer' })}
              onClick={() => void remove(notification.id)}
            >
              <Trash2 size={13} />
            </button>
          </li>
        ))}
      </ul>
      {data && notifications.length === 0 && (
        <p className={styles.muted}>{t({ en: 'No notifications', fr: 'Aucune notification' })}</p>
      )}
    </div>
  )
}
