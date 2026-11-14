import { lazy, Suspense, type RefObject } from 'react'
import { Clock, Search } from 'lucide-react'
import { saveSetting } from '../controller'
import { Composer } from '../feed/Composer'
import { Feed } from '../feed/Feed'
import { t } from '../i18n'
import { PluginBadges, PluginZone, usePluginContext } from '../plugins/Slots'
import { useRoute } from '../router'
import { useApp } from '../store/app'
import { Splitter } from './Splitter'
import { WorkflowBar } from './WorkflowBar'
import styles from './Shell.module.css'

const AgentDialogs = lazy(() => import('./AgentDialogs'))
// Error and elsewhere-confirmation banners are rare: kept out of the first-paint bundle
const ChatError = lazy(() => import('./ChatError').then((module) => ({ default: module.ChatError })))
const ConfirmationsElsewhere = lazy(() =>
  import('./ChatError').then((module) => ({ default: module.ConfirmationsElsewhere })),
)
const Home = lazy(() => import('./Home').then((module) => ({ default: module.Home })))

export function AgentPanel({ panes }: { panes: RefObject<HTMLDivElement | null> }) {
  const { projectId, sessionId } = useRoute()
  const pluginContext = usePluginContext()
  const mode = useApp((state) => state.session?.mode)
  const title = useApp((state) => state.session?.metadata.title)
  const dialog = useApp((state) => state.agentDialog)
  const showTimes = useApp((state) => state.display['display.showTimestamps'] === 'true')
  const timesLabel = showTimes
    ? t({ en: 'Hide message times', fr: 'Masquer les heures des messages' })
    : t({ en: 'Show message times', fr: 'Afficher les heures des messages' })

  return (
    <section className={styles.agent} data-pane="agent">
      <Splitter panes={panes} />
      {dialog && (
        <Suspense fallback={null}>
          <AgentDialogs dialog={dialog} />
        </Suspense>
      )}
      <div className={styles.agentHeader}>
        <span className={styles.eyebrow}>
          {t({ en: 'Agent', fr: 'Agent' })}
          {mode && ` / ${mode}`}
        </span>
        {title && <span className={styles.agentTitle}>{title}</span>}
        <PluginBadges slot="session.header.badges" context={pluginContext} />
        {sessionId && (
          <button
            type="button"
            className={styles.agentSearch}
            data-testid="toggle-timestamps"
            aria-pressed={showTimes}
            aria-label={timesLabel}
            title={timesLabel}
            onClick={() => void saveSetting('display.showTimestamps', showTimes ? 'false' : 'true')}
          >
            <Clock size={14} />
          </button>
        )}
        {sessionId && (
          <button
            type="button"
            className={styles.agentSearch}
            data-testid="message-search"
            aria-label={t({ en: 'Search timeline', fr: 'Rechercher dans la chronologie' })}
            title={t({ en: 'Search timeline', fr: 'Rechercher dans la chronologie' })}
            onClick={() => useApp.setState({ agentDialog: { kind: 'search' } })}
          >
            <Search size={14} />
          </button>
        )}
      </div>
      {projectId && (
        <Suspense fallback={null}>
          <ConfirmationsElsewhere projectId={projectId} />
        </Suspense>
      )}
      {sessionId ? (
        <>
          <PluginZone id="session.content" context={pluginContext}>
            <Feed key={sessionId} />
          </PluginZone>
          <Suspense fallback={null}>
            <ChatError />
          </Suspense>
          <WorkflowBar />
          <Composer />
          <PluginZone id="session.footer" context={pluginContext} />
        </>
      ) : (
        <Suspense fallback={null}>
          <Home />
        </Suspense>
      )}
    </section>
  )
}
