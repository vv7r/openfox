import { lazy, Suspense, useCallback, useRef } from 'react'
import { Bot, FolderTree, GitCompareArrows } from 'lucide-react'
import { t } from '../i18n'
import { usePlugins } from '../plugins/store'
import { usePath } from '../router'
import { useApp, type MobilePane } from '../store/app'
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

const MOBILE_TABS = [
  { pane: 'project', icon: FolderTree, label: { en: 'Project', fr: 'Projet' } },
  { pane: 'agent', icon: Bot, label: { en: 'Agent', fr: 'Agent' } },
  { pane: 'workspace', icon: GitCompareArrows, label: { en: 'Changes', fr: 'Changements' } },
] as const satisfies ReadonlyArray<{ pane: MobilePane; icon: unknown; label: { en: string; fr: string } }>

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
      <nav className={styles.mobileNav}>
        {MOBILE_TABS.map(({ pane, icon: Icon, label }) => (
          <button
            key={pane}
            type="button"
            data-active={mobilePane === pane || undefined}
            onClick={() => useApp.setState({ mobilePane: pane })}
          >
            <Icon size={18} />
            {t(label)}
          </button>
        ))}
      </nav>
    </div>
  )
}
