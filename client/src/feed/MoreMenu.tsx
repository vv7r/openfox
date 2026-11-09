import { useState } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { EllipsisVertical, Pencil } from 'lucide-react'
import type { Attachment, WorkflowScope } from '@shared/types.js'
import { launchWorkflow, loadCommand, sendCommand } from '../actions'
import { showSettings } from '../controller'
import { t } from '../i18n'
import { useApp, type NamedItem } from '../store/app'
import { fillTemplate, parametersToAsk, templateParams, uniqueById, withTypedText, type ParamRequest } from './launch'
import feedStyles from './Feed.module.css'
import styles from './MoreMenu.module.css'

export interface MoreMenuProps {
  workdir: string | undefined
  typedText: string
  attachments: Attachment[]
  clearComposer: () => void
  askParams: (request: ParamRequest) => void
  close: () => void
}

type Tab = 'commands' | 'workflows'

const TABS: Array<{ id: Tab; label: { en: string; fr: string } }> = [
  { id: 'commands', label: { en: 'Commands', fr: 'Commandes' } },
  { id: 'workflows', label: { en: 'Workflows', fr: 'Workflows' } },
]

const SCOPE_LABELS: Record<WorkflowScope, { en: string; fr: string }> = {
  builtin: { en: 'Built-in', fr: 'Intégré' },
  user: { en: 'Global', fr: 'Global' },
  project: { en: 'Project', fr: 'Projet' },
}

const canAutofocus = () => !matchMedia('(hover: none)').matches

function EditButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className={styles.icon}
      data-reveal
      aria-label={t({ en: 'Edit', fr: 'Modifier' })}
      title={t({ en: 'Edit', fr: 'Modifier' })}
      onClick={onClick}
    >
      <Pencil size={13} />
    </button>
  )
}

function SubGroups({ groups, onPick }: { groups: string[]; onPick: (group: string) => void }) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger
        className={styles.icon}
        data-testid="workflow-subgroups"
        aria-label={t({ en: 'Sub-groups', fr: 'Sous-groupes' })}
        title={t({ en: 'Sub-groups', fr: 'Sous-groupes' })}
      >
        <EllipsisVertical size={14} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={feedStyles.menu} align="end" sideOffset={4}>
          {groups.map((group) => (
            <DropdownMenu.Item key={group} className={feedStyles.menuItem} onSelect={() => onPick(group)}>
              {group}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

export default function MoreMenu({ workdir, typedText, attachments, clearComposer, askParams, close }: MoreMenuProps) {
  const [tab, setTab] = useState<Tab>('commands')
  const [search, setSearch] = useState('')
  const commands = uniqueById(useApp((state) => state.commands))
  const workflows = useApp((state) => state.workflows)

  const matches = (item: NamedItem) => item.name.toLowerCase().includes(search.toLowerCase())
  const items = tab === 'commands' ? commands : workflows
  const shown = items.filter(matches)

  const openEditor = (settingsTab: string, id: string, scope?: WorkflowScope) => {
    close()
    showSettings(settingsTab, { id, ...(scope ? { scope } : {}) })
  }

  const runWorkflow = (workflow: NamedItem, subGroup?: string) => {
    close()
    const options = { ...(workflow.scope ? { scope: workflow.scope } : {}), ...(subGroup ? { subGroup } : {}) }
    const parameters = parametersToAsk(workflow.parameters)
    if (parameters.length === 0) {
      launchWorkflow(workflow.id, undefined, options)
      return
    }
    askParams({
      name: workflow.name,
      confirmLabel: t({ en: 'Run workflow', fr: 'Exécuter le workflow' }),
      parameters,
      onConfirm: (values) => launchWorkflow(workflow.id, values, options),
    })
  }

  const runCommand = async (command: NamedItem) => {
    close()
    if (!workdir) return
    const { prompt, agentMode } = await loadCommand(command.id, workdir)
    const send = (text: string) => {
      void sendCommand(withTypedText(typedText, text), agentMode, attachments)
      clearComposer()
    }
    const keys = templateParams(prompt)
    if (keys.length === 0) {
      send(prompt)
      return
    }
    askParams({
      name: command.name,
      confirmLabel: t({ en: 'Launch command', fr: 'Lancer la commande' }),
      parameters: keys.map((key, position) => ({ id: key, label: key, position })),
      onConfirm: (values) => send(fillTemplate(prompt, values)),
    })
  }

  const empty =
    shown.length > 0
      ? null
      : items.length > 0
        ? t({ en: 'No matches', fr: 'Aucun résultat' })
        : tab === 'commands'
          ? t({ en: 'No commands yet', fr: 'Aucune commande pour le moment' })
          : t({ en: 'No workflows yet', fr: 'Aucun workflow pour le moment' })

  return (
    <div className={styles.menu} data-testid="more-menu">
      <div className={styles.tabs} role="tablist">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            data-testid={`more-tab-${id}`}
            onClick={() => {
              setTab(id)
              setSearch('')
            }}
          >
            {t(label)}
          </button>
        ))}
      </div>

      <input
        key={tab}
        className={feedStyles.pickerSearch}
        data-testid="more-search"
        autoFocus={canAutofocus()}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder={
          tab === 'commands'
            ? t({ en: 'Search commands…', fr: 'Rechercher des commandes…' })
            : t({ en: 'Search workflows…', fr: 'Rechercher des workflows…' })
        }
      />
      <div className={styles.list}>
        {empty && <p className={styles.empty}>{empty}</p>}
        {tab === 'commands' &&
          shown.map((command) => (
            <div key={command.id} className={styles.row} data-testid={`more-command-${command.id}`}>
              <button type="button" className={styles.pick} onClick={() => void runCommand(command)}>
                <span className={styles.name}>{command.name}</span>
              </button>
              <EditButton onClick={() => openEditor('commands', command.id)} />
            </div>
          ))}
        {tab === 'workflows' &&
          shown.map((workflow) => (
            <div
              key={`${workflow.id}-${workflow.scope}`}
              className={styles.row}
              data-testid={`more-workflow-${workflow.id}`}
            >
              <button type="button" className={styles.pick} onClick={() => runWorkflow(workflow)}>
                <span className={styles.dot} style={{ background: workflow.color ?? '#3b82f6' }} />
                <span className={styles.name}>{workflow.name}</span>
                {workflow.scope && <span className={styles.scope}>{t(SCOPE_LABELS[workflow.scope])}</span>}
                {(!workflow.startCondition || workflow.startCondition.type === 'always') && (
                  <span
                    className={styles.ready}
                    title={t({ en: 'Entry condition met', fr: 'Condition d’entrée satisfaite' })}
                  />
                )}
              </button>
              {workflow.subGroups && workflow.subGroups.length > 0 && (
                <SubGroups groups={workflow.subGroups} onPick={(group) => runWorkflow(workflow, group)} />
              )}
              <EditButton onClick={() => openEditor('workflows', workflow.id, workflow.scope)} />
            </div>
          ))}
      </div>
      <button
        type="button"
        className={styles.manage}
        onClick={() => {
          close()
          showSettings(tab)
        }}
      >
        {tab === 'commands'
          ? t({ en: 'Manage commands…', fr: 'Gérer les commandes…' })
          : t({ en: 'Manage workflows…', fr: 'Gérer les workflows…' })}
      </button>
    </div>
  )
}
