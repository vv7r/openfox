import { lazy, Suspense, useState } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import * as Popover from '@radix-ui/react-popover'
import { ChevronDown, Moon, PinOff } from 'lucide-react'
import {
  clearEffortPin,
  resetModel,
  selectEffort,
  selectModel,
  setDangerLevel,
  setNightMode,
  switchMode,
} from '../actions'
import { t } from '../i18n'
import { localize } from '../plugins/core'
import { PluginZone, usePluginContext } from '../plugins/Slots'
import { usePlugins } from '../plugins/store'
import { useApp } from '../store/app'
import styles from './Feed.module.css'

const ModelList = lazy(() => import('./ModelList').then((module) => ({ default: module.ModelList })))

const DANGER_LIST_THRESHOLD = 3

function AgentMenu() {
  const agents = useApp((state) => state.agents)
  const mode = useApp((state) => state.session?.mode)
  const current = agents.find((agent) => agent.id === mode)
  const nightMode = useApp((state) => state.session?.nightMode === true)
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className={`${styles.barButton} ${styles.agentButton}`}
        data-testid="agent-menu"
        style={{ color: current?.color }}
      >
        {nightMode && <Moon size={12} />}
        {current?.name ?? mode}
        <ChevronDown size={13} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={styles.menu} align="start" side="top" sideOffset={6}>
          {agents.map((agent) => (
            <DropdownMenu.Item
              key={agent.id}
              className={styles.menuItem}
              onSelect={() => void switchMode(agent.id, agent.name)}
            >
              <span style={{ color: agent.color }}>{agent.name}</span>
            </DropdownMenu.Item>
          ))}
          <label
            className={styles.nightToggle}
            title={t({
              en: 'The agent runs unattended: questions are answered automatically and confirmations denied.',
              fr: 'L’agent tourne sans surveillance : les questions reçoivent une réponse automatique et les confirmations sont refusées.',
            })}
          >
            <input
              type="checkbox"
              data-testid="night-mode"
              checked={nightMode}
              onChange={(event) => void setNightMode(event.target.checked)}
            />
            <Moon size={13} />
            {t({ en: 'Night mode', fr: 'Mode nuit' })}
          </label>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

function DangerToggle() {
  const level = useApp((state) => state.session?.dangerLevel ?? 'normal')
  const pluginLevels = usePlugins((state) => state.contributions.dangerLevels)
  const listMode = useApp((state) => {
    const levels = 2 + (pluginLevels?.length ?? 0)
    const threshold = Number(state.display['display.dangerLevelAutoListThreshold']) || DANGER_LIST_THRESHOLD
    return (
      state.display['display.dangerLevelDisplayMode'] === 'list' ||
      (state.display['display.dangerLevelAutoList'] === 'true' && levels > threshold)
    )
  })
  if (listMode) {
    return (
      <select
        className={styles.reasonList}
        data-testid="danger-select"
        aria-label={t({ en: 'Danger level', fr: 'Niveau de risque' })}
        value={level}
        onChange={(event) => void setDangerLevel(event.target.value)}
      >
        <option value="normal">{t({ en: 'Normal', fr: 'Normal' })}</option>
        {pluginLevels?.map((option) => (
          <option key={option.id} value={option.id}>
            {localize(option.label)}
          </option>
        ))}
        <option value="dangerous">{t({ en: 'Dangerous', fr: 'Dangereux' })}</option>
      </select>
    )
  }
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
  const pinned = useApp((state) => state.session?.providerPinnedEffort)
  const fullHeight = useApp((state) => state.display['display.modelSelectorHeight'] === 'full_height')

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger className={styles.barButton} data-testid="model-picker">
        <span className={styles.truncate}>{selected ?? t({ en: 'Select a model', fr: 'Choisir un modèle' })}</span>
        <ChevronDown size={13} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className={styles.picker}
          data-height={fullHeight ? 'full' : undefined}
          align="end"
          side="top"
          sideOffset={6}
        >
          <Suspense fallback={null}>
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
                            void selectEffort(current.id, selected!, effort)
                          }}
                        >
                          {effort}
                        </button>
                      ))}
                    </div>
                  )}
                  {pinned && (
                    <button
                      type="button"
                      className={styles.pickerItem}
                      data-testid="unpin-effort"
                      title={t({
                        en: 'Stop pinning the effort so agent overrides and session picks apply again.',
                        fr: 'Ne plus épingler l’effort : les choix d’agent et de session s’appliquent à nouveau.',
                      })}
                      onClick={() => {
                        setOpen(false)
                        void clearEffortPin()
                      }}
                    >
                      <PinOff size={12} />
                      {t({ en: 'Unpin reasoning effort', fr: 'Désépingler l’effort de raisonnement' })}
                    </button>
                  )}
                  <PluginZone id="model.picker.footer" context={pluginContext} />
                </>
              }
            />
          </Suspense>
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
