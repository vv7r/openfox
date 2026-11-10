import { lazy, Suspense, useState, type ReactNode } from 'react'
import { FolderTree, SquareTerminal, X } from 'lucide-react'
import { t } from '../i18n'
import { useRoute } from '../router'
import { useApp } from '../store/app'
import {
  closeTab,
  CONTEXT_VIEW,
  CRITERIA_VIEW,
  selectTab,
  selectView,
  useWorkspace,
  type Tab,
} from '../store/workspace'
import { ProjectTree } from './ProjectTree'
import styles from './Shell.module.css'

const CodeView = lazy(() => import('./CodeView'))
const TerminalPanel = lazy(() => import('./TerminalPanel'))
const ContextView = lazy(() => import('./SessionInfo').then((module) => ({ default: module.ContextView })))
const CriteriaView = lazy(() => import('./SessionInfo').then((module) => ({ default: module.CriteriaView })))

/** The numbers stay visible from any tab. */
function ContextBadge() {
  const percent = useApp((state) =>
    state.context ? Math.round((state.context.currentTokens / state.context.maxTokens) * 100) : null,
  )
  return percent === null ? null : <span className={styles.tabBadge}>{`${percent}%`}</span>
}

function CriteriaBadge() {
  const label = useApp((state) => {
    const criteria = state.session?.metadataEntries?.['criteria']
    if (!criteria?.length) return null
    return `${criteria.filter((entry) => entry.status === 'passed').length}/${criteria.length}`
  })
  return label === null ? null : <span className={styles.tabBadge}>{label}</span>
}

function Loading() {
  return <p className={styles.empty}>{t({ en: 'Loading…', fr: 'Chargement…' })}</p>
}

function ViewTab({ view, active, children }: { view: string | null; active: boolean; children: ReactNode }) {
  return (
    <span className={styles.tab} data-active={active || undefined} data-view={view ?? 'files'}>
      <button
        type="button"
        className={styles.tabLabel}
        data-testid={`tab-${view ?? 'files'}`}
        onClick={() => selectView(view)}
      >
        {children}
      </button>
    </span>
  )
}

function TabButton({ tab, active }: { tab: Tab; active: boolean }) {
  const name = tab.path.split('/').pop() ?? tab.path
  const dirty = useWorkspace((state) => state.dirty[tab.key] === true)
  const close = () => {
    const message = t({ en: 'Discard your unsaved changes?', fr: 'Abandonner vos modifications non enregistrées ?' })
    if (!dirty || window.confirm(message)) closeTab(tab.key)
  }
  return (
    <span className={styles.tab} data-active={active || undefined} title={tab.path}>
      <button type="button" className={styles.tabLabel} onClick={() => selectTab(tab.key)}>
        {tab.kind === 'diff' ? `${name}.diff` : name}
        {dirty && <span className={styles.tabDirty} data-testid="tab-dirty" />}
      </button>
      <button type="button" className={styles.tabClose} aria-label={t({ en: 'Close', fr: 'Fermer' })} onClick={close}>
        <X size={12} />
      </button>
    </span>
  )
}

export function WorkspacePanel() {
  const tabs = useWorkspace((state) => state.tabs)
  const activeKey = useWorkspace((state) => state.activeKey)
  const { sessionId } = useRoute()
  const selectedView = useWorkspace((state) => state.view)
  // Context and criteria belong to a session; the files tab stands in without one
  const view = sessionId ? selectedView : null
  const active = (view === null && tabs.find((tab) => tab.key === activeKey)) || null
  const [terminalOpen, setTerminalOpen] = useState(false)

  return (
    <section className={styles.workspace} data-pane="workspace" data-showing={view === null ? 'files' : 'progress'}>
      <div className={styles.tabs}>
        <ViewTab view={null} active={view === null}>
          {t({ en: 'Files', fr: 'Fichiers' })}
        </ViewTab>
        {sessionId && (
          <>
            <ViewTab view={CRITERIA_VIEW} active={view === CRITERIA_VIEW}>
              {t({ en: 'Criteria', fr: 'Critères' })}
              <CriteriaBadge />
            </ViewTab>
            <ViewTab view={CONTEXT_VIEW} active={view === CONTEXT_VIEW}>
              {t({ en: 'Context', fr: 'Contexte' })}
              <ContextBadge />
            </ViewTab>
          </>
        )}
      </div>
      {view === null && tabs.length > 0 && (
        <div className={styles.fileTabs} data-testid="file-tabs">
          <span className={styles.tab} data-active={active === null || undefined}>
            <button
              type="button"
              className={styles.tabLabel}
              data-testid="tab-tree"
              aria-label={t({ en: 'Project tree', fr: 'Arborescence du projet' })}
              title={t({ en: 'Project tree', fr: 'Arborescence du projet' })}
              onClick={() => selectTab(null)}
            >
              <FolderTree size={14} />
            </button>
          </span>
          {tabs.map((tab) => (
            <TabButton key={tab.key} tab={tab} active={tab.key === activeKey} />
          ))}
        </div>
      )}
      <div className={styles.workspaceBody}>
        <Suspense fallback={<Loading />}>
          {active ? (
            <CodeView key={active.key} tab={active} />
          ) : view === CONTEXT_VIEW ? (
            <ContextView />
          ) : view === CRITERIA_VIEW ? (
            <CriteriaView />
          ) : (
            <ProjectTree />
          )}
        </Suspense>
      </div>
      <div className={styles.terminalBar}>
        <button
          type="button"
          data-testid="terminal-toggle"
          data-active={terminalOpen || undefined}
          onClick={() => setTerminalOpen(!terminalOpen)}
        >
          <SquareTerminal size={14} />
          {t({ en: 'Terminal', fr: 'Terminal' })}
        </button>
      </div>
      {terminalOpen && (
        <div className={styles.terminalPane}>
          <Suspense fallback={<Loading />}>
            <TerminalPanel />
          </Suspense>
        </div>
      )}
    </section>
  )
}
