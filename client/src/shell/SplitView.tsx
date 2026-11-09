import { useMemo, useState } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Plus, X } from 'lucide-react'
import { getJson } from '../api'
import { useLoad } from '../hooks'
import { t } from '../i18n'
import styles from './Shell.module.css'

interface HomeSession {
  id: string
  projectId: string
  title?: string
}

const STORAGE_KEY = 'openfox:split-panes'

function readPanes(): HomeSession[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as HomeSession[]
  } catch {
    return []
  }
}

/** Each pane is an embedded client, so a running session keeps its own socket and state. */
export default function SplitView() {
  const [panes, setPanes] = useState(readPanes)
  const { data } = useLoad(() => getJson<{ sessions: HomeSession[] }>('/api/sessions/home'), 'home')
  const available = useMemo(
    () => (data?.sessions ?? []).filter((session) => !panes.some((pane) => pane.id === session.id)),
    [data, panes],
  )

  const update = (next: HomeSession[]) => {
    setPanes(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // The layout simply resets on the next load
    }
  }

  return (
    <div className={styles.split} data-testid="split-view">
      <div className={styles.splitBar}>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger className={styles.menuTrigger} data-testid="split-add">
            <Plus size={14} />
            {t({ en: 'Add a session', fr: 'Ajouter une session' })}
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className={styles.menu} align="start" sideOffset={6}>
              {available.map((session) => (
                <DropdownMenu.Item
                  key={session.id}
                  className={styles.menuItem}
                  onSelect={() => update([...panes, session])}
                >
                  {session.title ?? session.id.slice(0, 8)}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
      <div className={styles.splitPanes}>
        {panes.map((pane) => (
          <div key={pane.id} className={styles.splitPane}>
            <button
              type="button"
              className={styles.splitClose}
              aria-label={t({ en: 'Close pane', fr: 'Fermer le panneau' })}
              onClick={() => update(panes.filter((p) => p.id !== pane.id))}
            >
              <X size={13} />
            </button>
            <iframe title={pane.title ?? pane.id} src={`/p/${pane.projectId}/s/${pane.id}?embed=1`} />
          </div>
        ))}
        {panes.length === 0 && (
          <p className={styles.empty}>
            {t({ en: 'Add a session to start', fr: 'Ajoutez une session pour commencer' })}
          </p>
        )}
      </div>
    </div>
  )
}
