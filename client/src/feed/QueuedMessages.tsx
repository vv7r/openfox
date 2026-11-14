import { SendHorizontal, X } from 'lucide-react'
import { cancelQueued, sendQueuedNow } from '../actions'
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
            data-testid="queue-send-now"
            aria-label={t({ en: 'Stop the agent and send now', fr: "Arrêter l'agent et envoyer maintenant" })}
            title={t({ en: 'Stop the agent and send now', fr: "Arrêter l'agent et envoyer maintenant" })}
            onClick={() => void sendQueuedNow(item.queueId)}
          >
            <SendHorizontal size={12} />
          </button>
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
