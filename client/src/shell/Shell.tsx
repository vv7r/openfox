import { lazy, Suspense, useCallback, useRef } from 'react'
import { Bot, Files, FolderTree, ListChecks } from 'lucide-react'
import { t } from '../i18n'
import { usePlugins } from '../plugins/store'
import { usePath, useRoute } from '../router'
import { useApp, type MobilePane } from '../store/app'
import { CRITERIA_VIEW, selectView, useWorkspace } from '../store/workspace'
import { AgentPanel } from './AgentPanel'
import { Header } from './Header'
import { LeftPanel } from './LeftPanel'
import { Rail } from './Rail'
import { restoreWidths } from './Splitter'
import { StatusBar } from './StatusBar'
import { WorkspacePanel } from './WorkspacePanel'
import styles from './Shell.module.css'

const Panels = lazy(() => import('../panels/Panels'))
const PluginHost = lazy(() => import('../plugins/Host'))
const SplitView = lazy(() => import('./SplitView'))
const AutoLaunchToast = lazy(() => import('./AutoLaunchToast'))
const AppDialogs = lazy(() => import('./AppDialogs'))
const EMBEDDED = new URLSearchParams(location.search).has('embed')

type MobileTab = 'project' | 'agent' | 'files' | 'progress'

/**
 * The right panel is two tabs on a phone: its files, and the session's progress (criteria and
 * context), which a "Files" label did not cover.
 */
const MOBILE_TABS = [
  { tab: 'project', pane: 'project', icon: FolderTree, label: { en: 'Project', fr: 'Projet' } },
  { tab: 'agent', pane: 'agent', icon: Bot, label: { en: 'Agent', fr: 'Agent' } },
  { tab: 'files', pane: 'workspace', icon: Files, label: { en: 'Files', fr: 'Fichiers' } },
  { tab: 'progress', pane: 'workspace', icon: ListChecks, label: { en: 'Progress', fr: 'Suivi' } },
] as const satisfies ReadonlyArray<{
  tab: MobileTab
  pane: MobilePane
  icon: unknown
  label: { en: string; fr: string }
}>

/** Progress reopens on the tab last read there, criteria or context. */
let lastProgressView = CRITERIA_VIEW

function openMobileTab(tab: MobileTab, pane: MobilePane): void {
  const { view } = useWorkspace.getState()
  if (view !== null) lastProgressView = view
  useApp.setState({ mobilePane: pane })
  if (tab === 'files') selectView(null)
  else if (tab === 'progress') selectView(lastProgressView)
}

function MobileNav() {
  const mobilePane = useApp((state) => state.mobilePane)
  const view = useWorkspace((state) => state.view)
  const { sessionId } = useRoute()
  const current: MobileTab =
    mobilePane === 'workspace' ? (sessionId && view !== null ? 'progress' : 'files') : mobilePane
  return (
    <nav className={styles.mobileNav}>
      {MOBILE_TABS.filter(({ tab }) => tab !== 'progress' || sessionId).map(({ tab, pane, icon: Icon, label }) => (
        <button
          key={tab}
          type="button"
          data-testid={`mobile-tab-${tab}`}
          data-active={current === tab || undefined}
          onClick={() => openMobileTab(tab, pane)}
        >
          <Icon size={18} />
          {t(label)}
        </button>
      ))}
    </nav>
  )
}

export function Shell() {
  const panesRef = useRef<HTMLDivElement | null>(null)
  const layout = useApp((state) => state.layout)
  const panel = useApp((state) => state.panel)
  const autoLaunched = useApp((state) => state.autoLaunched)
  const appDialog = useApp((state) => state.appDialog)
  const path = usePath()
  const needsPluginHost = usePlugins((state) => state.activePanel !== null || state.toasts.length > 0)
  const mobilePane = useApp((state) => state.mobilePane)
  const leftCollapsed = useApp((state) => state.leftCollapsed)
  const rightCollapsed = useApp((state) => state.rightCollapsed)
  const panes = useCallback((element: HTMLDivElement | null) => {
    if (element) restoreWidths(element)
    panesRef.current = element
  }, [])

  const pluginHost = needsPluginHost && (
    <Suspense fallback={null}>
      <PluginHost />
    </Suspense>
  )

  if (EMBEDDED) {
    return (
      <div className={styles.embedded}>
        {pluginHost}
        <AgentPanel panes={panesRef} />
      </div>
    )
  }

  if (path === '/split-view') {
    return (
      <div className={styles.shell}>
        <Header />
        <div className={styles.main}>
          <Rail />
          <Suspense fallback={null}>
            <SplitView />
          </Suspense>
        </div>
        <StatusBar />
      </div>
    )
  }

  return (
    <div className={styles.shell}>
      {pluginHost}
      {panel && (
        <Suspense fallback={null}>
          <Panels panel={panel} />
        </Suspense>
      )}
      {appDialog && (
        <Suspense fallback={null}>
          <AppDialogs dialog={appDialog} />
        </Suspense>
      )}
      {autoLaunched && (
        <Suspense fallback={null}>
          <AutoLaunchToast launch={autoLaunched} />
        </Suspense>
      )}
      <Header />
      <div className={styles.main}>
        <Rail />
        {/* DOM order never changes: the layout only moves grid columns, so
            switching views keeps the feed's scroll and every pane's state. */}
        <div
          ref={panes}
          className={styles.panes}
          data-layout={layout}
          data-mobile-pane={mobilePane}
          data-left-collapsed={leftCollapsed || undefined}
          data-right-collapsed={rightCollapsed || undefined}
        >
          <LeftPanel />
          <WorkspacePanel />
          <AgentPanel panes={panesRef} />
        </div>
      </div>
      <StatusBar />
      <MobileNav />
    </div>
  )
}
