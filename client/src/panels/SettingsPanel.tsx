import { useState } from 'react'
import type { PluginSettingsTab } from '@shared/plugin.js'
import { t } from '../i18n'
import { extractScopedValues, localize } from '../plugins/core'
import { DeclarativeRenderer } from '../plugins/Render'
import { PluginZone, usePluginContext } from '../plugins/Slots'
import { usePlugins } from '../plugins/store'
import { useApp } from '../store/app'
import { AdvancedTab, DisplayTab, InstructionsTab, ToolsTab } from './SettingsForms'
import { PluginsTab, ProvidersTab } from './SettingsLists'
import { NotificationSettingsTab } from './NotificationSettingsTab'
import { WorkflowsTab } from './workflows/WorkflowsTab'
import { AgentsTab } from './library/AgentsTab'
import { CommandsTab } from './library/CommandsTab'
import { SkillsTab } from './library/SkillsTab'
import styles from './Panels.module.css'

const TABS = [
  { id: 'instructions', label: { en: 'Instructions', fr: 'Instructions' }, body: InstructionsTab },
  { id: 'providers', label: { en: 'Providers', fr: 'Fournisseurs' }, body: ProvidersTab },
  { id: 'display', label: { en: 'Display', fr: 'Affichage' }, body: DisplayTab },
  { id: 'tools', label: { en: 'Tools', fr: 'Outils' }, body: ToolsTab },
  { id: 'notifications', label: { en: 'Notifications', fr: 'Notifications' }, body: NotificationSettingsTab },
  { id: 'agents', label: { en: 'Agents', fr: 'Agents' }, body: AgentsTab },
  { id: 'commands', label: { en: 'Commands', fr: 'Commandes' }, body: CommandsTab },
  { id: 'workflows', label: { en: 'Workflows', fr: 'Workflows' }, body: WorkflowsTab },
  { id: 'skills', label: { en: 'Skills', fr: 'Compétences' }, body: SkillsTab },
  { id: 'plugins', label: { en: 'Plugins', fr: 'Plugins' }, body: PluginsTab },
  { id: 'advanced', label: { en: 'Advanced', fr: 'Avancé' }, body: AdvancedTab },
] as const

function PluginTab({ tab }: { tab: PluginSettingsTab }) {
  const context = usePluginContext()
  const published = usePlugins((state) => state.values)
  const values = tab.pluginId ? extractScopedValues(published, tab.pluginId, tab.id) : {}
  const content = Array.isArray(values['content']) ? (values['content'] as PluginSettingsTab['content']) : tab.content
  return (
    <div className={styles.stack}>
      {content.map((node, index) => (
        <DeclarativeRenderer
          key={index}
          node={node}
          values={values}
          context={{ ...context, ...(tab.pluginId ? { pluginId: tab.pluginId } : {}), tabId: tab.id }}
        />
      ))}
    </div>
  )
}

export default function SettingsPanel() {
  const requested = useApp((state) => state.settingsTab)
  const pluginTabs = usePlugins((state) => state.contributions.settingsTabs)
  const context = usePluginContext()
  const [active, setActive] = useState<string>(requested ?? 'instructions')
  const core = TABS.find((tab) => tab.id === active)
  const pluginTab = pluginTabs.find((tab) => `plugin:${tab.pluginId}:${tab.id}` === active)
  const Body = core?.body

  return (
    <div data-testid="settings">
      <div className={styles.tabs} role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === active}
            onClick={() => setActive(tab.id)}
          >
            {t(tab.label)}
          </button>
        ))}
        {pluginTabs.map((tab) => {
          const id = `plugin:${tab.pluginId}:${tab.id}`
          return (
            <button key={id} type="button" role="tab" aria-selected={id === active} onClick={() => setActive(id)}>
              {localize(tab.label)}
            </button>
          )
        })}
      </div>
      <PluginZone id="settings.content" context={context}>
        {Body && <Body />}
        {pluginTab && <PluginTab tab={pluginTab} />}
      </PluginZone>
    </div>
  )
}
