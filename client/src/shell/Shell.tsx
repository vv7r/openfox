import { useCallback, useRef } from 'react'
import { Bot, FolderTree, GitCompareArrows } from 'lucide-react'
import { t } from '../i18n'
import { useApp, type MobilePane } from '../store/app'
import { AgentPanel } from './AgentPanel'
import { Header } from './Header'
import { LeftPanel } from './LeftPanel'
import { Rail } from './Rail'
import { restoreWidths } from './Splitter'
import { StatusBar } from './StatusBar'
import { WorkspacePanel } from './WorkspacePanel'
import styles from './Shell.module.css'

const MOBILE_TABS = [
  { pane: 'project', icon: FolderTree, label: { en: 'Project', fr: 'Projet' } },
  { pane: 'agent', icon: Bot, label: { en: 'Agent', fr: 'Agent' } },
  { pane: 'workspace', icon: GitCompareArrows, label: { en: 'Changes', fr: 'Changements' } },
] as const satisfies ReadonlyArray<{ pane: MobilePane; icon: unknown; label: { en: string; fr: string } }>

export function Shell() {
  const panesRef = useRef<HTMLDivElement | null>(null)
  const layout = useApp((state) => state.layout)
  const mobilePane = useApp((state) => state.mobilePane)
  const leftCollapsed = useApp((state) => state.leftCollapsed)
  const rightCollapsed = useApp((state) => state.rightCollapsed)
  const panes = useCallback((element: HTMLDivElement | null) => {
    if (element) restoreWidths(element)
    panesRef.current = element
  }, [])

  return (
    <div className={styles.shell}>
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
