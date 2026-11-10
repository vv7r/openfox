import { useEffect, useMemo, useState } from 'react'
import type { Message, Session } from '@shared/types.js'
import { getJson } from '../api'
import { deriveItems } from '../feed/items'
import { FeedRow } from '../feed/MessageItem'
import { t } from '../i18n'
import { resetFeed, setHistory, useFeed } from '../store/feed'
import feedStyles from '../feed/Feed.module.css'
import styles from './Shell.module.css'

interface SessionData {
  session: Session
  messages: Message[]
  hiddenCount?: number
}

/** A full, printable copy of a session: fetched once, no socket, no virtualization. */
export default function ReadonlySession({ sessionId }: { sessionId: string }) {
  const [session, setSession] = useState<Session | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const ids = useFeed((state) => state.ids)
  const hidden = useFeed((state) => state.hiddenCount)
  const items = useMemo(() => deriveItems(ids, useFeed.getState().byId), [ids])

  useEffect(() => {
    let active = true
    resetFeed(sessionId)
    setError(null)
    getJson<SessionData>(`/api/sessions/${sessionId}?full=true`)
      .then((data) => {
        if (!active) return
        setHistory(sessionId, data.messages, data.hiddenCount ?? 0, { keepAll: true })
        setSession(data.session)
      })
      .catch((failure: unknown) => {
        if (active)
          setError(failure instanceof Error ? failure.message : t({ en: 'Unknown error', fr: 'Erreur inconnue' }))
      })
    return () => {
      active = false
    }
  }, [sessionId, version])

  const refresh = () => setVersion((value) => value + 1)

  if (error) {
    return (
      <div className={styles.home}>
        <p className={styles.error}>{error}</p>
        <button type="button" className={styles.primary} onClick={refresh}>
          {t({ en: 'Retry', fr: 'Réessayer' })}
        </button>
      </div>
    )
  }

  return (
    <div className={styles.readonly} data-testid="readonly-session">
      <header className={styles.readonlyHeader}>
        <h1>{`${session?.metadata.title ?? t({ en: 'Session', fr: 'Session' })} · ${t({ en: 'Read-only view', fr: 'Vue en lecture seule' })}`}</h1>
        <span>
          {t({ en: '{{count}} messages', fr: '{{count}} messages' }, { count: ids.length })}
          {hidden > 0 &&
            ` (${t({ en: '{{count}} older hidden', fr: '{{count}} plus anciens masqués' }, { count: hidden })})`}
        </span>
        <button type="button" onClick={refresh}>
          {t({ en: 'Refresh', fr: 'Actualiser' })}
        </button>
      </header>
      <div className={`${styles.readonlyBody} ${feedStyles.feedStatic}`}>
        {items.map((item) => (
          <FeedRow key={item.key} item={item} />
        ))}
      </div>
    </div>
  )
}
