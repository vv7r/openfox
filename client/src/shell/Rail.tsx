import { House, MessagesSquare, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { toggleColumn } from '../controller'
import { t } from '../i18n'
import { Link, useRoute } from '../router'
import { useApp } from '../store/app'
import styles from './Shell.module.css'

export function Rail() {
  const { projectId } = useRoute()
  const collapsed = useApp((state) => state.leftCollapsed)
  const Toggle = collapsed ? PanelLeftOpen : PanelLeftClose
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
      <div className={styles.grow} />
      <button
        type="button"
        className={styles.railItem}
        title={
          collapsed
            ? t({ en: 'Show left panel', fr: 'Afficher le panneau gauche' })
            : t({ en: 'Hide left panel', fr: 'Masquer le panneau gauche' })
        }
        onClick={() => toggleColumn('left')}
      >
        <Toggle size={20} />
      </button>
    </nav>
  )
}
