import { t } from '../i18n'
import { useApp } from '../store/app'
import styles from './Shell.module.css'

function Changes() {
  const files = useApp((state) => state.git?.diff.files)
  if (!files?.length) return <p className={styles.empty}>{t({ en: 'No changes', fr: 'Aucun changement' })}</p>
  return (
    <ul className={styles.files}>
      {files.map((file) => (
        <li key={file.path}>
          <span className={styles.truncate}>{file.path}</span>
          <span className={styles.added}>{`+${file.additions}`}</span>
          <span className={styles.removed}>{`-${file.deletions}`}</span>
        </li>
      ))}
    </ul>
  )
}

export function WorkspacePanel() {
  return (
    <section className={styles.workspace} data-pane="workspace">
      <div className={styles.tabs}>
        <span className={styles.tab} data-active>
          {t({ en: 'Changes', fr: 'Changements' })}
        </span>
      </div>
      <div className={styles.workspaceBody}>
        <Changes />
      </div>
    </section>
  )
}
