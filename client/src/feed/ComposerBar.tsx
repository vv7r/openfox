import { useState } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import * as Popover from '@radix-ui/react-popover'
import { ChevronDown } from 'lucide-react'
import { resetModel, selectModel, setDangerLevel, switchMode } from '../actions'
import { t } from '../i18n'
import { localize } from '../plugins/core'
import { PluginZone, usePluginContext } from '../plugins/Slots'
import { usePlugins } from '../plugins/store'
import { useApp } from '../store/app'
import { ModelList } from './ModelList'
import styles from './Feed.module.css'

function AgentMenu() {
  const agents = useApp((state) => state.agents)
  const mode = useApp((state) => state.session?.mode)
  const current = agents.find((agent) => agent.id === mode)
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className={`${styles.barButton} ${styles.agentButton}`}
        data-testid="agent-menu"
        style={{ color: current?.color }}
      >
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
  const pluginLevels = usePlugins((state) => state.contributions.dangerLevels)
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
      {pluginLevels?.map((option) => (
        <button
          key={option.id}
          type="button"
          title={localize(option.description)}
          aria-pressed={level === option.id}
          data-danger
          onClick={() => void setDangerLevel(option.id)}
        >
          {localize(option.label)}
        </button>
      ))}
    </div>
  )
}

function ModelPicker() {
  const pluginContext = usePluginContext()
  const providers = useApp((state) => state.providers)
  const selected = useApp((state) => state.session?.providerModel ?? state.model)
  const manual = useApp((state) => Boolean(state.session?.providerManual))
  const providerId = useApp((state) => state.session?.providerId)
  const activeEffort = useApp((state) => state.session?.providerReasoningEffort)
  const [open, setOpen] = useState(false)
  const current = providers.find((provider) => provider.id === providerId)
  const efforts = current?.models.find((model) => model.id === selected)?.reasoningEfforts ?? []

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger className={styles.barButton} data-testid="model-picker">
        <span className={styles.truncate}>{selected ?? t({ en: 'Select a model', fr: 'Choisir un modèle' })}</span>
        <ChevronDown size={13} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className={styles.picker} align="end" side="top" sideOffset={6}>
          <ModelList
            selected={selected ?? undefined}
            onPick={(id, model) => {
              setOpen(false)
              void selectModel(id, model)
            }}
            before={
              manual && (
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
              )
            }
            after={
              <>
                {efforts.length > 0 && current && (
                  <div className={styles.efforts}>
                    <span>
                      {t({
                        en: 'Effort (changing it resets the LLM cache)',
                        fr: 'Effort (le changer réinitialise le cache LLM)',
                      })}
                    </span>
                    {efforts.map((effort) => (
                      <button
                        key={effort}
                        type="button"
                        data-selected={effort === activeEffort || undefined}
                        onClick={() => {
                          setOpen(false)
                          void selectModel(current.id, selected!, effort)
                        }}
                      >
                        {effort}
                      </button>
                    ))}
                  </div>
                )}
                <PluginZone id="model.picker.footer" context={pluginContext} />
              </>
            }
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

function AgentStatus() {
  const running = useApp((state) => state.session?.isRunning === true)
  const label = running ? t({ en: 'Agent running', fr: 'Agent en cours' }) : t({ en: 'Agent ready', fr: 'Agent prêt' })
  return (
    <span className={styles.status} data-testid="agent-status" title={label}>
      <span className={styles.statusDot} data-running={running || undefined} />
      <span className={styles.statusLabel}>{label}</span>
    </span>
  )
}

export function ComposerBar() {
  return (
    <div className={styles.bar}>
      <AgentMenu />
      <DangerToggle />
      <div className={styles.barSpacer} />
      <AgentStatus />
      <ModelPicker />
    </div>
  )
}
