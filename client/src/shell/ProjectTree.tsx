import { ChevronDown, ChevronRight, File, Folder } from 'lucide-react'
import { t } from '../i18n'
import { openTab, toggleDir, useWorkspace } from '../store/workspace'
import styles from './Shell.module.css'

const INDENT_PX = 14

function Directory({ dir, depth }: { dir: string; depth: number }) {
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
              onClick={() => openTab('file', entry.path)}
            >
              <span className={styles.treeChevron} />
              <File size={13} />
              <span className={styles.truncate}>{entry.name}</span>
            </button>
          )
        }
        const Chevron = open ? ChevronDown : ChevronRight
        return (
          <div key={entry.path}>
            <button type="button" className={styles.treeRow} style={padding} onClick={() => toggleDir(entry.path)}>
              <Chevron size={13} className={styles.treeChevron} />
              <Folder size={13} />
              <span className={styles.truncate}>{entry.name}</span>
            </button>
            {open && <Directory dir={entry.path} depth={depth + 1} />}
          </div>
        )
      })}
    </>
  )
}

export function ProjectTree() {
  return (
    <section className={styles.treeSection}>
      <h2 className={styles.eyebrow}>{t({ en: 'Project', fr: 'Projet' })}</h2>
      <Directory dir="" depth={0} />
    </section>
  )
}
