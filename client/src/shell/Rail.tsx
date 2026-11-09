import { House, MessagesSquare } from 'lucide-react'
import { t } from '../i18n'
import { Link, useRoute } from '../router'
import styles from './Shell.module.css'

export function Rail() {
  const { projectId } = useRoute()
  return (
    <nav className={styles.rail}>
      <Link
        href="/"
        className={styles.railItem}
        data-active={!projectId || undefined}
        title={t({ en: 'Home', fr: 'Accueil' })}
      >
        <House size={20} />
      </Link>
      {projectId && (
        <Link
          href={`/p/${projectId}`}
          className={styles.railItem}
          data-active
          title={t({ en: 'Sessions', fr: 'Sessions' })}
        >
          <MessagesSquare size={20} />
        </Link>
      )}
    </nav>
  )
}
