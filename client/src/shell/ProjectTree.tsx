import { ChevronDown, ChevronRight, File, Folder, RefreshCw } from 'lucide-react'
import { useAgentFiles } from '../feed/agentFiles'
import { t } from '../i18n'
import { useRoute } from '../router'
import { useApp } from '../store/app'
import { openTab, refreshTree, toggleDir, useWorkspace } from '../store/workspace'
import styles from './Shell.module.css'

const INDENT_PX = 14

function Directory({ dir, depth, locked }: { dir: string; depth: number; locked: ReadonlySet<string> }) {
  const entries = useWorkspace((state) => state.tree[dir])
  const expanded = useWorkspace((state) => state.expanded)
  return (
    <>
      {entries?.map((entry) => {
        const open = expanded[entry.path] === true
        const padding = { paddingLeft: 8 + depth * INDENT_PX }
        if (entry.type === 'file') {
          return (
            <button
              key={entry.path}
              type="button"
              className={styles.treeRow}
              style={padding}
              disabled={locked.has(entry.path)}
              title={
                locked.has(entry.path)
                  ? t({ en: 'The agent is working on this file', fr: 'L’agent travaille sur ce fichier' })
                  : undefined
              }
              onClick={() => openTab('file', entry.path)}
            >
              <span className={styles.treeChevron} />
              <File size={13} className={styles.treeIcon} />
              <span className={styles.treeName}>{entry.name}</span>
            </button>
          )
        }
        const Chevron = open ? ChevronDown : ChevronRight
        return (
          <div key={entry.path}>
            <button type="button" className={styles.treeRow} style={padding} onClick={() => toggleDir(entry.path)}>
              <Chevron size={13} className={styles.treeChevron} />
              <Folder size={13} className={styles.treeIcon} />
              <span className={styles.treeName}>{entry.name}</span>
            </button>
            {open && <Directory dir={entry.path} depth={depth + 1} locked={locked} />}
          </div>
        )
      })}
    </>
  )
}

export function ProjectTree() {
  const { projectId } = useRoute()
  const name = useApp((state) => state.projects.find((project) => project.id === projectId)?.name)
  const locked = useAgentFiles()
  if (!projectId) {
    return (
      <p className={styles.empty}>
        {t({ en: 'Choose a project to see its files', fr: 'Choisis un projet pour voir ses fichiers' })}
      </p>
    )
  }
  return (
    <section className={styles.treeSection} data-testid="project-tree">
      <div className={styles.sectionHeader}>
        <h2 className={styles.eyebrow}>{name}</h2>
        <button
          type="button"
          className={styles.textButton}
          aria-label={t({ en: 'Refresh', fr: 'Actualiser' })}
          title={t({ en: 'Refresh', fr: 'Actualiser' })}
          onClick={refreshTree}
        >
          <RefreshCw size={12} />
        </button>
      </div>
      <Directory dir="" depth={0} locked={locked} />
    </section>
  )
}
