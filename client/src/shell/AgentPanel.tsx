import type { RefObject } from 'react'
import { Composer } from '../feed/Composer'
import { Feed } from '../feed/Feed'
import { t } from '../i18n'
import { PluginBadges, PluginZone, usePluginContext } from '../plugins/Slots'
import { useRoute } from '../router'
import { useApp } from '../store/app'
import { ChatError } from './ChatError'
import { SessionBlock } from './SessionBlock'
import { Splitter } from './Splitter'
import { WorkflowBar } from './WorkflowBar'
import { Home } from './Home'
import styles from './Shell.module.css'

export function AgentPanel({ panes }: { panes: RefObject<HTMLDivElement | null> }) {
  const { sessionId } = useRoute()
  const pluginContext = usePluginContext()
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
        <PluginBadges slot="session.header.badges" context={pluginContext} />
      </div>
      {sessionId ? (
        <>
          <SessionBlock />
          <PluginZone id="session.content" context={pluginContext}>
            <Feed key={sessionId} />
          </PluginZone>
          <ChatError />
          <WorkflowBar />
          <Composer />
          <PluginZone id="session.footer" context={pluginContext} />
        </>
      ) : (
        <Home />
      )}
    </section>
  )
}
