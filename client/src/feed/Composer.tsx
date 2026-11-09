import { useState, type FormEvent } from 'react'
import { sendJson } from '../api'
import { t } from '../i18n'
import styles from './Feed.module.css'

export function Composer({ sessionId }: { sessionId: string }) {
  const [text, setText] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const content = text.trim()
    if (!content) return
    setText('')
    void sendJson(`/api/sessions/${sessionId}/message`, 'POST', { content })
  }

  return (
    <form className={styles.composer} onSubmit={submit}>
      <textarea
        className={styles.input}
        data-testid="chat-input-textarea"
        rows={1}
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={t({ en: 'Message the agent…', fr: 'Message à l’agent…' })}
      />
      <button className={styles.send} type="submit">
        {t({ en: 'Send', fr: 'Envoyer' })}
      </button>
    </form>
  )
}
