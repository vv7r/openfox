import { lazy, Suspense } from 'react'
import { X } from 'lucide-react'
import { t } from '../i18n'
import { useApp } from '../store/app'
import { closeTab, openTab, selectTab, useWorkspace, type Tab } from '../store/workspace'
import styles from './Shell.module.css'

const CodeView = lazy(() => import('./CodeView'))

function Changes() {
  const files = useApp((state) => state.git?.diff.files)
  if (!files?.length) return <p className={styles.empty}>{t({ en: 'No changes', fr: 'Aucun changement' })}</p>
  return (
    <ul className={styles.files}>
      {files.map((file) => (
        <li key={file.path}>
          <button type="button" onClick={() => openTab('diff', file.path)}>
            <span className={styles.truncate}>{file.path}</span>
            {/* git has no line counts for untracked or binary files */}
            {file.additions + file.deletions > 0 && (
              <>
                <span className={styles.added}>{`+${file.additions}`}</span>
                <span className={styles.removed}>{`-${file.deletions}`}</span>
              </>
            )}
          </button>
        </li>
      ))}
    </ul>
  )
}

function TabButton({ tab, active }: { tab: Tab; active: boolean }) {
  const name = tab.path.split('/').pop() ?? tab.path
  return (
    <span className={styles.tab} data-active={active || undefined} title={tab.path}>
      <button type="button" className={styles.tabLabel} onClick={() => selectTab(tab.key)}>
        {tab.kind === 'diff' ? `${name}.diff` : name}
      </button>
      <button
        type="button"
        className={styles.tabClose}
        aria-label={t({ en: 'Close', fr: 'Fermer' })}
        onClick={() => closeTab(tab.key)}
      >
        <X size={12} />
      </button>
    </span>
  )
}

export function WorkspacePanel() {
  const tabs = useWorkspace((state) => state.tabs)
  const activeKey = useWorkspace((state) => state.activeKey)
  const active = tabs.find((tab) => tab.key === activeKey) ?? null

  return (
    <section className={styles.workspace} data-pane="workspace">
      <div className={styles.tabs}>
        <span className={styles.tab} data-active={active === null || undefined}>
          <button type="button" className={styles.tabLabel} onClick={() => selectTab(null)}>
            {t({ en: 'Changes', fr: 'Changements' })}
          </button>
        </span>
        {tabs.map((tab) => (
          <TabButton key={tab.key} tab={tab} active={tab.key === activeKey} />
        ))}
      </div>
      <div className={styles.workspaceBody}>
        {active ? (
          <Suspense fallback={null}>
            <CodeView key={active.key} tab={active} />
          </Suspense>
        ) : (
          <Changes />
        )}
      </div>
    </section>
  )
}
