import { useMemo, useState } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import * as Popover from '@radix-ui/react-popover'
import { ChevronDown } from 'lucide-react'
import { launchWorkflow, resetModel, selectModel, setDangerLevel, switchMode } from '../actions'
import { t } from '../i18n'
import { useApp } from '../store/app'
import styles from './Feed.module.css'

function AgentMenu() {
  const agents = useApp((state) => state.agents)
  const mode = useApp((state) => state.session?.mode)
  const current = agents.find((agent) => agent.id === mode)
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className={styles.barButton} data-testid="agent-menu" style={{ color: current?.color }}>
        {current?.name ?? mode}
        <ChevronDown size={13} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={styles.menu} align="start" side="top" sideOffset={6}>
          {agents.map((agent) => (
            <DropdownMenu.Item key={agent.id} className={styles.menuItem} onSelect={() => void switchMode(agent.id)}>
              <span style={{ color: agent.color }}>{agent.name}</span>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

function DangerToggle() {
  const level = useApp((state) => state.session?.dangerLevel ?? 'normal')
  return (
    <div className={styles.segmented} role="group" aria-label={t({ en: 'Danger level', fr: 'Niveau de risque' })}>
      <button type="button" aria-pressed={level === 'normal'} onClick={() => void setDangerLevel('normal')}>
        {t({ en: 'Normal', fr: 'Normal' })}
      </button>
      <button
        type="button"
        aria-pressed={level === 'dangerous'}
        data-danger
        onClick={() => void setDangerLevel('dangerous')}
      >
        {t({ en: 'Dangerous', fr: 'Dangereux' })}
      </button>
    </div>
  )
}

function ModelPicker() {
  const providers = useApp((state) => state.providers)
  const selected = useApp((state) => state.session?.providerModel ?? state.model)
  const manual = useApp((state) => Boolean(state.session?.providerManual))
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return providers
      .map((provider) => ({
        provider,
        models: provider.models.filter((model) => model.id.toLowerCase().includes(needle)),
      }))
      .filter((group) => group.models.length > 0)
  }, [providers, query])

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger className={styles.barButton} data-testid="model-picker">
        <span className={styles.truncate}>{selected ?? t({ en: 'Select a model', fr: 'Choisir un modèle' })}</span>
        <ChevronDown size={13} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className={styles.picker} align="end" side="top" sideOffset={6}>
          <input
            className={styles.pickerSearch}
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t({ en: 'Search models…', fr: 'Rechercher des modèles…' })}
          />
          <div className={styles.pickerList}>
            {manual && (
              <button
                type="button"
                className={styles.pickerItem}
                onClick={() => {
                  setOpen(false)
                  void resetModel()
                }}
              >
                {t({ en: 'Use the default model', fr: 'Utiliser le modèle par défaut' })}
              </button>
            )}
            {groups.map(({ provider, models }) => (
              <div key={provider.id}>
                <div className={styles.pickerGroup}>{provider.name}</div>
                {models.map((model) => (
                  <button
                    key={model.id}
                    type="button"
                    className={styles.pickerItem}
                    data-selected={model.id === selected || undefined}
                    onClick={() => {
                      setOpen(false)
                      void selectModel(provider.id, model.id)
                    }}
                  >
                    {model.id}
                  </button>
                ))}
              </div>
            ))}
            {groups.length === 0 && (
              <p className={styles.pickerEmpty}>{t({ en: 'No models match', fr: 'Aucun modèle ne correspond' })}</p>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

function WorkflowMenu() {
  const workflows = useApp((state) => state.workflows)
  if (workflows.length === 0) return null
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className={styles.barButton} data-testid="workflow-menu">
        {t({ en: 'Workflows', fr: 'Workflows' })}
        <ChevronDown size={13} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={styles.menu} align="start" side="top" sideOffset={6}>
          {workflows.map((workflow) => (
            <DropdownMenu.Item
              key={workflow.id}
              className={styles.menuItem}
              onSelect={() => launchWorkflow(workflow.id)}
            >
              <span style={{ color: workflow.color }}>{workflow.name}</span>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

export function ComposerBar() {
  return (
    <div className={styles.bar}>
      <AgentMenu />
      <DangerToggle />
      <WorkflowMenu />
      <div className={styles.barSpacer} />
      <ModelPicker />
    </div>
  )
}
