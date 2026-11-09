import type { ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { t } from '../i18n'
import panelStyles from '../panels/Panels.module.css'
import { useApp, type AgentDialog } from '../store/app'
import { MessageSearch } from './MessageSearch'
import { TurnStatsView } from './TurnStatsView'
import styles from './AgentDialogs.module.css'

const close = () => useApp.setState({ agentDialog: null })

function Frame({ title, narrow, children }: { title: string; narrow?: boolean; children: ReactNode }) {
  return (
    <Dialog.Root open onOpenChange={(open) => !open && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className={panelStyles.overlay} />
        <Dialog.Content
          className={`${panelStyles.dialog} ${narrow ? styles.narrow : ''}`}
          data-testid="agent-dialog"
          aria-describedby={undefined}
        >
          <div className={panelStyles.header}>
            <Dialog.Title className={panelStyles.title}>{title}</Dialog.Title>
            <Dialog.Close className={panelStyles.close} aria-label={t({ en: 'Close', fr: 'Fermer' })}>
              <X size={16} />
            </Dialog.Close>
          </div>
          <div className={panelStyles.body}>{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export default function AgentDialogs({ dialog }: { dialog: AgentDialog }) {
  switch (dialog.kind) {
    case 'search':
      return (
        <Frame narrow title={t({ en: 'Search timeline', fr: 'Rechercher dans la chronologie' })}>
          <MessageSearch onClose={close} />
        </Frame>
      )
    case 'turn-stats':
      return (
        <Frame narrow title={t({ en: 'Turn stats', fr: 'Statistiques du tour' })}>
          <TurnStatsView stats={dialog.stats} />
        </Frame>
      )
  }
}
