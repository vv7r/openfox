import { useState } from 'react'
import { t } from '../i18n'
import { AdvancedTab, DisplayTab, InstructionsTab, ToolsTab } from './SettingsForms'
import { LibraryTab, PluginsTab, ProvidersTab, SkillsTab } from './SettingsLists'
import styles from './Panels.module.css'

const TABS = [
  { id: 'instructions', label: { en: 'Instructions', fr: 'Instructions' }, body: InstructionsTab },
  { id: 'providers', label: { en: 'Providers', fr: 'Fournisseurs' }, body: ProvidersTab },
  { id: 'display', label: { en: 'Display', fr: 'Affichage' }, body: DisplayTab },
  { id: 'tools', label: { en: 'Tools', fr: 'Outils' }, body: ToolsTab },
  { id: 'agents', label: { en: 'Agents', fr: 'Agents' }, body: () => <LibraryTab kind="agents" /> },
  { id: 'commands', label: { en: 'Commands', fr: 'Commandes' }, body: () => <LibraryTab kind="commands" /> },
  { id: 'workflows', label: { en: 'Workflows', fr: 'Workflows' }, body: () => <LibraryTab kind="workflows" /> },
  { id: 'skills', label: { en: 'Skills', fr: 'Compétences' }, body: SkillsTab },
  { id: 'plugins', label: { en: 'Plugins', fr: 'Plugins' }, body: PluginsTab },
  { id: 'advanced', label: { en: 'Advanced', fr: 'Avancé' }, body: AdvancedTab },
] as const

export default function SettingsPanel() {
  const [active, setActive] = useState<(typeof TABS)[number]['id']>('instructions')
  const Body = TABS.find((tab) => tab.id === active)!.body
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
      </div>
      <Body />
    </div>
  )
}
