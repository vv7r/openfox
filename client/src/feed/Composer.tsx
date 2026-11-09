import { lazy, Suspense, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Send, Square } from 'lucide-react'
import { sendMessage, stopGeneration } from '../actions'
import { t } from '../i18n'
import { useApp } from '../store/app'
import { ComposerBar } from './ComposerBar'
import styles from './Feed.module.css'

const QueuedMessages = lazy(() => import('./QueuedMessages'))

export function Composer() {
  const [text, setText] = useState('')
  const running = useApp((state) => state.session?.isRunning === true)
  const hasQueue = useApp((state) => state.queue.length > 0)

  const send = () => {
    const content = text.trim()
    if (!content) return
    setText('')
    void sendMessage(content)
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    send()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      send()
    }
  }

  return (
    <div className={styles.composerArea}>
      {hasQueue && (
        <Suspense fallback={null}>
          <QueuedMessages />
        </Suspense>
      )}
      <form className={styles.composer} onSubmit={submit}>
        <textarea
          className={styles.input}
          data-testid="chat-input-textarea"
          rows={2}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t({ en: 'Message the agent…', fr: 'Message à l’agent…' })}
        />
        {running && (
          <button
            className={styles.stop}
            type="button"
            data-testid="chat-stop-button"
            aria-label={t({ en: 'Stop', fr: 'Arrêter' })}
            title={t({ en: 'Stop', fr: 'Arrêter' })}
            onClick={() => void stopGeneration()}
          >
            <Square size={16} />
          </button>
        )}
        <button
          className={styles.send}
          type="submit"
          data-testid="chat-send-button"
          aria-label={t({ en: 'Send', fr: 'Envoyer' })}
        >
          <Send size={16} />
        </button>
      </form>
      <ComposerBar />
    </div>
  )
}
