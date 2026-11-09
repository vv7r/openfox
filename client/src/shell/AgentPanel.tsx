import type { RefObject } from 'react'
import { Composer } from '../feed/Composer'
import { Feed } from '../feed/Feed'
import { t } from '../i18n'
import { useRoute } from '../router'
import { useApp } from '../store/app'
import { Splitter } from './Splitter'
import styles from './Shell.module.css'

export function AgentPanel({ panes }: { panes: RefObject<HTMLDivElement | null> }) {
  const { sessionId } = useRoute()
  const mode = useApp((state) => state.session?.mode)
  const title = useApp((state) => state.session?.metadata.title)

  return (
    <section className={styles.agent} data-pane="agent">
      <Splitter panes={panes} />
      <div className={styles.agentHeader}>
        <span className={styles.eyebrow}>
          {t({ en: 'Agent', fr: 'Agent' })}
          {mode && ` / ${mode}`}
        </span>
        {title && <span className={styles.agentTitle}>{title}</span>}
      </div>
      {sessionId ? (
        <>
          <Feed key={sessionId} />
          <Composer sessionId={sessionId} />
        </>
      ) : (
        <p className={styles.empty}>{t({ en: 'No session selected', fr: 'Aucune session sélectionnée' })}</p>
      )}
    </section>
  )
}
