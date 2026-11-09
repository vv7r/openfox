import { X } from 'lucide-react'
import { cancelQueued } from '../actions'
import { t } from '../i18n'
import { useApp } from '../store/app'
import styles from './Feed.module.css'

export default function QueuedMessages() {
  const queue = useApp((state) => state.queue)
  return (
    <div className={styles.queue} data-testid="queued-messages">
      <span className={styles.queueTitle}>{t({ en: 'Queued', fr: 'En attente' })}</span>
      {queue.map((item) => (
        <div key={item.queueId} className={styles.queueItem}>
          <span className={styles.truncate}>{item.content}</span>
          <button
            type="button"
            aria-label={t({ en: 'Cancel', fr: 'Annuler' })}
            onClick={() => void cancelQueued(item.queueId)}
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}
