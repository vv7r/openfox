import { createRoot } from 'react-dom/client'
import type { Message } from '@shared/types.js'
import { Composer } from './feed/Composer'
import { Feed } from './feed/Feed'
import styles from './feed/Feed.module.css'
import { applyServerMessage, setHistory } from './store/feed'
import { Socket } from './transport/ws'
import './styles/tokens.css'

const sessionId = /^\/p\/[^/]+\/s\/([^/]+)/.exec(location.pathname)?.[1]

async function loadHistory(id: string): Promise<void> {
  const response = await fetch(`/api/sessions/${id}`)
  if (!response.ok) return
  const data = (await response.json()) as { messages: Message[] }
  setHistory(id, data.messages)
}

if (sessionId) {
  const socket: Socket = new Socket(applyServerMessage, (status) => {
    if (status === 'connected') socket.send('session.load', { sessionId })
  })
  void loadHistory(sessionId).then(() => socket.connect())
  createRoot(document.getElementById('root')!).render(
    <div className={styles.page}>
      <Feed />
      <Composer sessionId={sessionId} />
    </div>,
  )
}
