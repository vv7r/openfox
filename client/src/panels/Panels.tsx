import { lazy, Suspense } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { openPanel } from '../controller'
import { t } from '../i18n'
import type { PanelId } from '../store/app'
import { GitPanel } from './GitPanel'
import { McpPanel } from './McpPanel'
import { NotificationsPanel } from './NotificationsPanel'
import { ProcessesPanel } from './ProcessesPanel'
import { TasksPanel } from './TasksPanel'
import styles from './Panels.module.css'

const SettingsPanel = lazy(() => import('./SettingsPanel'))

const TITLES: Record<PanelId, { en: string; fr: string }> = {
  tasks: { en: 'Project tasks', fr: 'Tâches du projet' },
  git: { en: 'Branches and workspaces', fr: 'Branches et espaces' },
  processes: { en: 'Processes and dev server', fr: 'Processus et serveur de dev' },
  mcp: { en: 'MCP servers', fr: 'Serveurs MCP' },
  notifications: { en: 'Notifications', fr: 'Notifications' },
  settings: { en: 'Settings', fr: 'Paramètres' },
}

function Body({ panel }: { panel: PanelId }) {
  switch (panel) {
    case 'tasks':
      return <TasksPanel />
    case 'git':
      return <GitPanel />
    case 'processes':
      return <ProcessesPanel />
    case 'mcp':
      return <McpPanel />
    case 'notifications':
      return <NotificationsPanel />
    case 'settings':
      return (
        <Suspense fallback={null}>
          <SettingsPanel />
        </Suspense>
      )
  }
}

export default function Panels({ panel }: { panel: PanelId }) {
  return (
    <Dialog.Root open onOpenChange={(open) => !open && openPanel(null)}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.dialog} data-testid={`panel-${panel}`} aria-describedby={undefined}>
          <div className={styles.header}>
            <Dialog.Title className={styles.title}>{t(TITLES[panel])}</Dialog.Title>
            <Dialog.Close className={styles.close} aria-label={t({ en: 'Close', fr: 'Fermer' })}>
              <X size={16} />
            </Dialog.Close>
          </div>
          <div className={styles.body}>
            <Body panel={panel} />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
