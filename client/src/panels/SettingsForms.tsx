import { useState } from 'react'
import { getJson } from '../api'
import { saveSetting } from '../controller'
import { useLoad } from '../hooks'
import { applyLocale, t } from '../i18n'
import { useApp } from '../store/app'
import { ThemeTab } from './ThemeTab'
import styles from './Panels.module.css'

type Text = { en: string; fr: string }

function useSettings(keys: string[]) {
  const query = keys.join(',')
  const { data } = useLoad(() => getJson<Record<string, string>>(`/api/settings?keys=${query}`), query)
  const [local, setLocal] = useState<Record<string, string>>({})
  const value = (key: string) => local[key] ?? data?.[key] ?? ''
  const set = (key: string, next: string) => {
    setLocal((all) => ({ ...all, [key]: next }))
    void saveSetting(key, next)
  }
  return { ready: data !== null, value, set }
}

function Toggles({ items }: { items: Array<{ key: string; label: Text; onByDefault?: boolean }> }) {
  const { ready, value, set } = useSettings(items.map((item) => item.key))
  if (!ready) return null
  return (
    <>
      {items.map((item) => {
        const current = value(item.key)
        const checked = current === '' ? item.onByDefault === true : current === 'true'
        return (
          <label key={item.key} className={styles.toggle}>
            <input type="checkbox" checked={checked} onChange={() => set(item.key, String(!checked))} />
            {t(item.label)}
          </label>
        )
      })}
    </>
  )
}

/** A text setting saved on blur, so typing does not write on every key. */
function TextSetting({
  settingKey,
  label,
  secret = false,
  multiline = false,
}: {
  settingKey: string
  label: Text
  secret?: boolean
  multiline?: boolean
}) {
  const { data } = useLoad(() => getJson<{ value?: string }>(`/api/settings/${settingKey}`), settingKey)
  const [draft, setDraft] = useState<string | null>(null)
  const value = draft ?? data?.value ?? ''
  const commit = () => {
    if (draft !== null && draft !== (data?.value ?? '')) void saveSetting(settingKey, draft)
  }
  return (
    <label className={styles.field}>
      {t(label)}
      {multiline ? (
        <textarea
          className={styles.textarea}
          value={value}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
        />
      ) : (
        <input
          className={styles.input}
          type={secret ? 'password' : 'text'}
          value={value}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
        />
      )}
    </label>
  )
}

export function InstructionsTab() {
  return (
    <>
      <TextSetting
        settingKey="agent.language"
        label={{
          en: 'Agent language (automatic, or a language name)',
          fr: 'Langue de l’agent (automatic, ou un nom de langue)',
        }}
      />
      <TextSetting
        settingKey="global_instructions"
        multiline
        label={{
          en: 'Global instructions, injected in every prompt',
          fr: 'Instructions globales, injectées dans chaque prompt',
        }}
      />
    </>
  )
}

function Appearance() {
  const { ready, value, set } = useSettings(['display.locale'])
  if (!ready) return null
  return (
    <>
      <label className={styles.field}>
        {t({ en: 'Language', fr: 'Langue' })}
        <select
          className={styles.select}
          value={value('display.locale') || 'automatic'}
          onChange={(event) => {
            set('display.locale', event.target.value)
            useApp.setState({ locale: applyLocale(event.target.value), panel: null })
          }}
        >
          <option value="automatic">{t({ en: 'Automatic', fr: 'Automatique' })}</option>
          <option value="en">{t({ en: 'English', fr: 'Anglais' })}</option>
          <option value="fr">{t({ en: 'French', fr: 'Français' })}</option>
        </select>
      </label>
    </>
  )
}

export function DisplayTab() {
  return (
    <>
      <ThemeTab />
      <Appearance />
      <Toggles
        items={[
          {
            key: 'display.showThinking',
            onByDefault: true,
            label: { en: 'Open thinking blocks', fr: 'Ouvrir les blocs de réflexion' },
          },
          {
            key: 'display.showVerboseToolOutput',
            onByDefault: true,
            label: { en: 'Expand tool output', fr: 'Déplier la sortie des outils' },
          },
          {
            key: 'display.showStats',
            onByDefault: true,
            label: { en: 'Show per-message statistics', fr: 'Afficher les statistiques par message' },
          },
          {
            key: 'display.showAgentDefinitions',
            onByDefault: true,
            label: { en: 'Show injected agent instructions', fr: 'Afficher les instructions injectées' },
          },
          {
            key: 'display.showWorkflowBars',
            onByDefault: true,
            label: { en: 'Show workflow markers', fr: 'Afficher les repères de workflow' },
          },
        ]}
      />
    </>
  )
}

function SearchEngine() {
  const { ready, value, set } = useSettings(['search.engine'])
  if (!ready) return null
  return (
    <label className={styles.field}>
      {t({ en: 'Search engine', fr: 'Moteur de recherche' })}
      <select
        className={styles.select}
        value={value('search.engine')}
        onChange={(event) => set('search.engine', event.target.value)}
      >
        <option value="">{t({ en: 'None', fr: 'Aucun' })}</option>
        <option value="tavily">{t({ en: 'Tavily', fr: 'Tavily' })}</option>
        <option value="searxng">{t({ en: 'SearXNG', fr: 'SearXNG' })}</option>
      </select>
    </label>
  )
}

export function ToolsTab() {
  return (
    <>
      <SearchEngine />
      <TextSetting settingKey="search.tavilyApiKey" secret label={{ en: 'Tavily API key', fr: 'Clé API Tavily' }} />
      <TextSetting settingKey="search.searxngUrl" label={{ en: 'SearXNG URL', fr: 'URL SearXNG' }} />
      <TextSetting settingKey="search.searxngApiKey" secret label={{ en: 'SearXNG API key', fr: 'Clé API SearXNG' }} />
      <TextSetting settingKey="tools.shell" label={{ en: 'Shell', fr: 'Shell' }} />
      <Toggles
        items={[
          {
            key: 'tools.confirmOnWorkspaceActions',
            label: { en: 'Confirm workspace actions', fr: 'Confirmer les actions sur les espaces' },
          },
        ]}
      />
    </>
  )
}

function UpdateSection() {
  const update = useApp((state) => state.update)
  const version = useApp((state) => state.version)
  const check = () => void import('../notify/startup').then((module) => module.checkForUpdate(true))
  return (
    <section className={styles.row} data-testid="update-section">
      <span className={styles.grow}>
        {t({ en: 'Version {{version}}', fr: 'Version {{version}}' }, { version: version ?? '' })}
        {update.status === 'upToDate' && (
          <span className={styles.muted}>{` · ${t({ en: 'up to date', fr: 'à jour' })}`}</span>
        )}
        {update.status === 'error' && (
          <span className={styles.muted}>{` · ${t({ en: 'check failed', fr: 'vérification impossible' })}`}</span>
        )}
      </span>
      <button type="button" disabled={update.status === 'checking'} onClick={check}>
        {t({ en: 'Check for updates', fr: 'Rechercher une mise à jour' })}
      </button>
      {update.status === 'available' && (
        <button
          type="button"
          className={styles.primary}
          onClick={() => useApp.setState({ appDialog: 'update', panel: null })}
        >
          {t({ en: 'Update to {{version}}', fr: 'Mettre à jour vers {{version}}' }, { version: update.latest ?? '' })}
        </button>
      )}
      <button type="button" onClick={() => useApp.setState({ appDialog: 'changelog', panel: null })}>
        {t({ en: 'Changelog', fr: 'Journal des modifications' })}
      </button>
    </section>
  )
}

export function AdvancedTab() {
  return (
    <>
      <UpdateSection />
      <Toggles
        items={[
          { key: 'llm.dynamicSystemPrompt', label: { en: 'Dynamic system prompt', fr: 'Prompt système dynamique' } },
          { key: 'llm.cavemanThinking', label: { en: 'Terse thinking', fr: 'Réflexion concise' } },
          { key: 'cache.warming', label: { en: 'Cache warming', fr: 'Préchauffage du cache' } },
          {
            key: 'agent.autoContinueOnBoot',
            label: { en: 'Resume sessions on boot', fr: 'Reprendre les sessions au démarrage' },
          },
          { key: 'agent.allowParallelSubAgents', label: { en: 'Parallel sub-agents', fr: 'Sous-agents en parallèle' } },
          { key: 'features.perSessionMcp', label: { en: 'Per-session MCP', fr: 'MCP par session' } },
          { key: 'display.showOpenInEditorLinks', label: { en: 'Open-in-editor links', fr: 'Liens vers l’éditeur' } },
        ]}
      />
      <TextSetting settingKey="agent.defaultAgent" label={{ en: 'Default agent', fr: 'Agent par défaut' }} />
      <TextSetting settingKey="network.proxyUrl" label={{ en: 'Proxy URL', fr: 'URL du proxy' }} />
      <TextSetting
        settingKey="editor.vscodeRemotePrefix"
        label={{ en: 'VS Code remote prefix', fr: 'Préfixe distant VS Code' }}
      />
    </>
  )
}
