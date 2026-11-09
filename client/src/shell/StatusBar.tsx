import { GitBranch } from 'lucide-react'
import { t } from '../i18n'
import { useApp } from '../store/app'
import styles from './Shell.module.css'

export function StatusBar() {
  const git = useApp((state) => state.git)
  const connected = useApp((state) => state.connected)
  const version = useApp((state) => state.version)
  const files = git?.diff.files ?? []
  const additions = files.reduce((sum, file) => sum + file.additions, 0)
  const deletions = files.reduce((sum, file) => sum + file.deletions, 0)

  return (
    <footer className={styles.statusBar} data-testid="status-bar">
      {git?.branch && (
        <span className={styles.statusItem}>
          <GitBranch size={13} />
          {git.branch}
        </span>
      )}
      {files.length > 0 && (
        <span className={styles.statusItem}>
          {t(
            {
              en: { one: '{{count}} file changed', other: '{{count}} files changed' },
              fr: { one: '{{count}} fichier modifié', other: '{{count}} fichiers modifiés' },
            },
            { count: files.length },
          )}
          <span className={styles.added}>{`+${additions}`}</span>
          <span className={styles.removed}>{`-${deletions}`}</span>
        </span>
      )}
      <div className={styles.grow} />
      <span className={styles.statusItem}>
        <span className={styles.connection} data-connected={connected || undefined} />
        {connected ? t({ en: 'Connected', fr: 'Connecté' }) : t({ en: 'Disconnected', fr: 'Déconnecté' })}
      </span>
      {version && <span className={styles.statusItem}>{`OpenFox v${version}`}</span>}
    </footer>
  )
}
