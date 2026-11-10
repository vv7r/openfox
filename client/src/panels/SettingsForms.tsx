import { useState } from 'react'
import { authFetch, getJson, sendJson } from '../api'
import { saveSetting } from '../controller'
import { useLoad } from '../hooks'
import { applyLocale, t } from '../i18n'
import { useApp } from '../store/app'
import {
  clampRetries,
  isValidRegex,
  MAX_RETRIES_PER_TURN,
  parseRetryPatterns,
  serializeRetryPatterns,
  type RetryPattern,
  type RetryPatterns,
} from './retryPatterns'
import { Hint } from './Hint'
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

function Toggles({ items }: { items: Array<{ key: string; label: Text; onByDefault?: boolean; hint?: Text }> }) {
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
            <span>{t(item.label)}</span>
            {item.hint && <Hint text={item.hint} />}
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
  hint,
}: {
  settingKey: string
  label: Text
  secret?: boolean
  multiline?: boolean
  hint?: Text
}) {
  const { data } = useLoad(() => getJson<{ value?: string }>(`/api/settings/${settingKey}`), settingKey)
  const [draft, setDraft] = useState<string | null>(null)
  const value = draft ?? data?.value ?? ''
  const commit = () => {
    if (draft !== null && draft !== (data?.value ?? '')) void saveSetting(settingKey, draft)
  }
  return (
    <label className={styles.field}>
      <span className={styles.labelRow}>
        {t(label)}
        {hint && <Hint text={hint} />}
      </span>
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

function DisplayChoices() {
  const keys = [
    'display.modelSelectorHeight',
    'display.dangerLevelDisplayMode',
    'display.dangerLevelAutoListThreshold',
    'display.maxVisibleItems',
  ]
  const { ready, value, set } = useSettings(keys)
  if (!ready) return null
  return (
    <>
      <label className={styles.field}>
        {t({ en: 'Model selector height', fr: 'Hauteur du sélecteur de modèle' })}
        <select
          className={styles.select}
          value={value(keys[0]!) || 'default'}
          onChange={(event) => set(keys[0]!, event.target.value)}
        >
          <option value="default">{t({ en: 'Default', fr: 'Par défaut' })}</option>
          <option value="full_height">{t({ en: 'Full height', fr: 'Pleine hauteur' })}</option>
        </select>
      </label>
      <label className={styles.field}>
        {t({ en: 'Danger level selector', fr: 'Sélecteur de niveau de risque' })}
        <select
          className={styles.select}
          value={value(keys[1]!) || 'default'}
          onChange={(event) => set(keys[1]!, event.target.value)}
        >
          <option value="default">{t({ en: 'Buttons', fr: 'Boutons' })}</option>
          <option value="list">{t({ en: 'Dropdown list', fr: 'Liste déroulante' })}</option>
        </select>
      </label>
      <label className={styles.field}>
        <span className={styles.labelRow}>
          {t({ en: 'Danger level list threshold', fr: 'Seuil de la liste des niveaux de risque' })}
          <Hint
            text={{
              en: 'Number of danger levels above which the selector becomes a dropdown list, when the option above is on.',
              fr: 'Nombre de niveaux de risque au-delà duquel le sélecteur devient une liste déroulante, si l’option correspondante est activée.',
            }}
          />
        </span>
        <input
          className={styles.input}
          type="number"
          min={1}
          data-testid="danger-threshold"
          value={value(keys[2]!) || '3'}
          onChange={(event) => set(keys[2]!, event.target.value)}
        />
      </label>
      <label className={styles.field}>
        <span className={styles.labelRow}>
          {t({
            en: 'Max visible items in the feed (0 keeps everything)',
            fr: 'Éléments visibles max dans le fil (0 garde tout)',
          })}
          <Hint
            text={{
              en: 'Lightens long sessions by keeping only the latest items in the feed. The rest stays available through the full history link.',
              fr: 'Allège les longues sessions en ne gardant que les derniers éléments dans le fil. Le reste reste accessible par le lien vers l’historique complet.',
            }}
          />
        </span>
        <input
          className={styles.input}
          type="number"
          min={0}
          data-testid="max-visible"
          value={value(keys[3]!) || '0'}
          onChange={(event) => set(keys[3]!, event.target.value)}
        />
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
            hint: {
              en: 'Shows in the feed the agent definitions that OpenFox adds to the conversation.',
              fr: 'Montre dans le fil les définitions d’agents qu’OpenFox ajoute à la conversation.',
            },
          },
          {
            key: 'display.showWorkflowBars',
            onByDefault: true,
            label: { en: 'Show workflow markers', fr: 'Afficher les repères de workflow' },
            hint: {
              en: 'Shows start and end markers around workflows in the feed.',
              fr: 'Affiche dans le fil les marqueurs de début et de fin de workflow.',
            },
          },
          {
            key: 'display.showToolCallStreaming',
            label: { en: 'Show live tool call previews', fr: 'Afficher l’aperçu des outils en direct' },
            hint: {
              en: 'While a model writes or edits a file, previews the content live as it streams in.',
              fr: 'Pendant qu’un modèle écrit ou modifie un fichier, montre le contenu en direct au fil de la génération.',
            },
          },
          {
            key: 'display.collapseLargeToolCalls',
            onByDefault: true,
            label: {
              en: 'Collapse large tool calls automatically',
              fr: 'Replier automatiquement les gros appels d’outils',
            },
            hint: {
              en: 'Finished tool calls with large outputs start collapsed, which speeds up loading long sessions.',
              fr: 'Les appels d’outils terminés avec une grande sortie démarrent repliés, ce qui accélère le chargement des longues sessions.',
            },
          },
          {
            key: 'display.showSyntaxHighlighting',
            onByDefault: true,
            label: { en: 'Show syntax highlighting', fr: 'Afficher la coloration syntaxique' },
          },
          {
            key: 'display.showProjectsAboveSessions',
            label: {
              en: 'Show projects above sessions on the home page',
              fr: 'Afficher les projets au-dessus des sessions sur l’accueil',
            },
          },
          {
            key: 'display.fullscreenSlashCommand',
            label: { en: 'Larger slash commands list', fr: 'Liste des commandes slash agrandie' },
            hint: {
              en: 'The list that opens when typing / fills the available screen height.',
              fr: 'La liste qui s’ouvre en tapant / occupe toute la hauteur d’écran disponible.',
            },
          },
          {
            key: 'display.mobileFullscreenComposer',
            label: { en: 'Expand composer full-screen on mobile', fr: 'Composer en plein écran sur mobile' },
          },
          {
            key: 'display.collapseFavoritesByDefault',
            label: {
              en: 'Collapse favorites in the model selector',
              fr: 'Replier les favoris dans le sélecteur de modèle',
            },
          },
          {
            key: 'display.collapseProvidersByDefault',
            label: {
              en: 'Collapse providers in the model selector',
              fr: 'Replier les fournisseurs dans le sélecteur de modèle',
            },
          },
          {
            key: 'display.dangerLevelAutoList',
            label: {
              en: 'Show danger levels as a list above the threshold',
              fr: 'Afficher les niveaux de risque en liste au-delà du seuil',
            },
            hint: {
              en: 'Useful when plugins add danger levels: too many buttons turn into a dropdown list.',
              fr: 'Utile quand des plugins ajoutent des niveaux de risque : trop de boutons deviennent une liste déroulante.',
            },
          },
        ]}
      />
      <DisplayChoices />
    </>
  )
}

function SearchEngine() {
  const { ready, value, set } = useSettings(['search.engine'])
  if (!ready) return null
  const engine = value('search.engine')
  return (
    <>
      <label className={styles.field}>
        {t({ en: 'Search engine', fr: 'Moteur de recherche' })}
        <select className={styles.select} value={engine} onChange={(event) => set('search.engine', event.target.value)}>
          <option value="">{t({ en: 'None', fr: 'Aucun' })}</option>
          <option value="tavily">{t({ en: 'Tavily', fr: 'Tavily' })}</option>
          <option value="searxng">{t({ en: 'SearXNG', fr: 'SearXNG' })}</option>
        </select>
      </label>
      {(engine === 'tavily' || engine === 'searxng') && (
        <TestButton
          testId="search-test"
          label={{ en: 'Test search', fr: 'Tester la recherche' }}
          run={() => runSearchTest(engine)}
        />
      )}
    </>
  )
}

export function ToolsTab() {
  return (
    <>
      <SearchEngine />
      <TextSetting settingKey="search.tavilyApiKey" secret label={{ en: 'Tavily API key', fr: 'Clé API Tavily' }} />
      <TextSetting settingKey="search.searxngUrl" label={{ en: 'SearXNG URL', fr: 'URL SearXNG' }} />
      <TextSetting settingKey="search.searxngApiKey" secret label={{ en: 'SearXNG API key', fr: 'Clé API SearXNG' }} />
      <ShellSetting />
      <Toggles
        items={[
          {
            key: 'tools.confirmOnWorkspaceActions',
            label: { en: 'Confirm workspace actions', fr: 'Confirmer les actions sur les espaces' },
            hint: {
              en: 'Asks for confirmation before workspace changes and git mutations. Off, the agent proceeds without interruption.',
              fr: 'Demande une confirmation avant les modifications d’espace de travail et les opérations git. Décoché, l’agent continue sans interruption.',
            },
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
    <section className={`${styles.row} ${styles.updateRow}`} data-testid="update-section">
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

function TestButton({ label, testId, run }: { label: Text; testId: string; run: () => Promise<Response> }) {
  const [state, setState] = useState<{ busy: boolean; ok?: boolean; detail?: string }>({ busy: false })
  const test = async () => {
    setState({ busy: true })
    const response = await run().catch(() => null)
    const data = (await response?.json().catch(() => null)) as {
      success?: boolean
      error?: string
      message?: string
    } | null
    const ok = Boolean(response?.ok && data?.success !== false)
    setState({ busy: false, ok, ...(data?.error || data?.message ? { detail: data.error ?? data.message! } : {}) })
  }
  return (
    <div className={styles.row}>
      <button type="button" data-testid={testId} disabled={state.busy} onClick={() => void test()}>
        {t(label)}
      </button>
      {state.ok === true && <span>{t({ en: 'OK', fr: 'OK' })}</span>}
      {state.ok === false && <span className={styles.error}>{state.detail ?? t({ en: 'Failed', fr: 'Échec' })}</span>}
    </div>
  )
}

const SEARCH_KEYS = 'search.tavilyApiKey,search.searxngUrl,search.searxngApiKey'

/** Reads the keys when clicked: the fields above save themselves and this one must see that. */
async function runSearchTest(engine: string): Promise<Response> {
  const saved = await getJson<Record<string, string>>(`/api/settings?keys=${SEARCH_KEYS}`)
  return sendJson(
    '/api/search/test',
    'POST',
    engine === 'tavily'
      ? { engine, tavilyApiKey: saved['search.tavilyApiKey'] || undefined }
      : {
          engine,
          searxngUrl: saved['search.searxngUrl'] || undefined,
          searxngApiKey: saved['search.searxngApiKey'] || undefined,
        },
  )
}

interface ShellOption {
  id: string
  label: string
  available: boolean
}

/** Only Windows reports several shells; elsewhere the free field is all there is. */
function ShellSetting() {
  const { data } = useLoad(() => getJson<{ shells?: ShellOption[] }>('/api/tools/shells'), 'shells')
  const { ready, value, set } = useSettings(['tools.shell'])
  const shells = data?.shells ?? []
  if (data && shells.length === 0) return <TextSetting settingKey="tools.shell" label={{ en: 'Shell', fr: 'Shell' }} />
  if (!ready || !data) return null
  return (
    <label className={styles.field}>
      <span className={styles.labelRow}>
        {t({ en: 'Shell', fr: 'Shell' })}
        <Hint
          text={{
            en: 'Applies to new commands and newly opened terminals. Running terminals keep their shell.',
            fr: 'S’applique aux nouvelles commandes et aux terminaux nouvellement ouverts. Les terminaux en cours gardent leur shell.',
          }}
        />
      </span>
      <select
        className={styles.select}
        value={value('tools.shell') || 'cmd'}
        onChange={(event) => set('tools.shell', event.target.value)}
      >
        {shells.map((shell) => (
          <option key={shell.id} value={shell.id} disabled={!shell.available}>
            {shell.label}
          </option>
        ))}
      </select>
    </label>
  )
}

interface AgentChoice {
  id: string
  name: string
  subagent?: boolean
}

function DefaultAgentSetting() {
  const { data } = useLoad(
    () => getJson<{ defaults: AgentChoice[]; userItems: AgentChoice[] }>('/api/agents'),
    'default-agents',
  )
  const { ready, value, set } = useSettings(['agent.defaultAgent'])
  if (!ready || !data) return null
  const agents = [...data.defaults, ...data.userItems].filter((agent) => !agent.subagent)
  const current = value('agent.defaultAgent')
  return (
    <label className={styles.field}>
      <span className={styles.labelRow}>
        {t({ en: 'Default agent', fr: 'Agent par défaut' })}
        <Hint
          text={{
            en: 'The agent new sessions start with. The stock Planner is read-only; custom agents can do more.',
            fr: 'L’agent avec lequel démarrent les nouvelles sessions. Le Planner standard est en lecture seule ; les agents personnalisés peuvent faire davantage.',
          }}
        />
      </span>
      <select
        className={styles.select}
        data-testid="default-agent"
        value={current}
        onChange={(event) => set('agent.defaultAgent', event.target.value)}
      >
        <option value="">{t({ en: 'System default (planner)', fr: 'Défaut système (planificateur)' })}</option>
        {agents.map((agent) => (
          <option key={agent.id} value={agent.id}>
            {agent.name}
          </option>
        ))}
        {current && !agents.some((agent) => agent.id === current) && <option value={current}>{current}</option>}
      </select>
    </label>
  )
}

function RetryPatternsSetting() {
  const { ready, value, set } = useSettings(['agent.retryPatterns'])
  const [draft, setDraft] = useState<RetryPatterns | null>(null)
  if (!ready) return null
  const current = draft ?? parseRetryPatterns(value('agent.retryPatterns'))
  const update = (next: RetryPatterns) => {
    setDraft(next)
    set('agent.retryPatterns', JSON.stringify(serializeRetryPatterns(next)))
  }
  const patch = (index: number, change: Partial<RetryPattern>) =>
    update({ ...current, patterns: current.patterns.map((item, at) => (at === index ? { ...item, ...change } : item)) })
  return (
    <section className={styles.stack} data-testid="retry-patterns">
      <h3 className={styles.eyebrow}>{t({ en: 'Auto-retry patterns', fr: 'Motifs de réessai automatique' })}</h3>
      <p className={styles.muted}>
        {t({
          en: 'Regular expressions that, when matched in an LLM response mid-stream, trigger a retry with a "continue" prompt. Empty or invalid patterns are not saved.',
          fr: 'Expressions régulières qui, lorsqu’elles correspondent à une réponse du LLM en cours de flux, déclenchent un réessai avec un prompt « continue ». Les motifs vides ou invalides ne sont pas enregistrés.',
        })}
      </p>
      <label className={styles.field}>
        {t({ en: 'Max retries per turn', fr: 'Réessais max par tour' })}
        <input
          className={styles.input}
          type="number"
          min={1}
          max={MAX_RETRIES_PER_TURN}
          value={current.maxRetriesPerTurn}
          onChange={(event) => update({ ...current, maxRetriesPerTurn: clampRetries(Number(event.target.value)) })}
        />
      </label>
      {current.patterns.map((item, index) => (
        <div key={index} className={styles.row}>
          <input
            type="checkbox"
            aria-label={t({ en: 'Active', fr: 'Actif' })}
            checked={item.active}
            onChange={(event) => patch(index, { active: event.target.checked })}
          />
          <select
            className={styles.select}
            aria-label={t({ en: 'Field', fr: 'Champ' })}
            value={item.field}
            onChange={(event) => patch(index, { field: event.target.value as RetryPattern['field'] })}
          >
            <option value="content">{t({ en: 'content', fr: 'contenu' })}</option>
            <option value="thinking">{t({ en: 'thinking', fr: 'réflexion' })}</option>
            <option value="both">{t({ en: 'both', fr: 'les deux' })}</option>
          </select>
          <input
            className={`${styles.input} ${styles.grow}`}
            aria-invalid={item.pattern !== '' && !isValidRegex(item.pattern)}
            value={item.pattern}
            onChange={(event) => patch(index, { pattern: event.target.value })}
            placeholder={t({ en: 'regex pattern', fr: 'motif regex' })}
          />
          <button
            type="button"
            onClick={() => update({ ...current, patterns: current.patterns.filter((_, at) => at !== index) })}
          >
            {t({ en: 'Remove', fr: 'Retirer' })}
          </button>
        </div>
      ))}
      <button
        type="button"
        data-testid="retry-pattern-add"
        onClick={() =>
          update({
            ...current,
            patterns: [...current.patterns, { field: 'content', pattern: '', action: 'retry', active: true }],
          })
        }
      >
        {t({ en: 'Add pattern', fr: 'Ajouter un motif' })}
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
          {
            key: 'llm.dynamicSystemPrompt',
            label: { en: 'Dynamic system prompt', fr: 'Prompt système dynamique' },
            hint: {
              en: 'Rebuilds the system prompt on every turn. Recommended: off.',
              fr: 'Reconstruit le prompt système à chaque tour. Valeur recommandée : décoché.',
            },
          },
          {
            key: 'llm.cavemanThinking',
            label: { en: 'Terse thinking', fr: 'Réflexion concise' },
            hint: {
              en: 'Tells the agent to reason in short telegraphic fragments to use fewer thinking tokens. Experimental: may affect quality.',
              fr: 'Demande à l’agent de raisonner en fragments télégraphiques pour consommer moins de tokens de réflexion. Expérimental : peut affecter la qualité.',
            },
          },
          {
            key: 'cache.warming',
            label: { en: 'Cache warming', fr: 'Préchauffage du cache' },
            hint: {
              en: 'On the first keystroke in an empty session, sends the context to the LLM ahead of time so the first reply starts sooner. This makes one extra LLM call.',
              fr: 'Au premier caractère tapé dans une session vide, envoie le contexte au LLM à l’avance pour que la première réponse démarre plus vite. Cela fait un appel LLM de plus.',
            },
          },
          {
            key: 'agent.autoContinueOnBoot',
            label: { en: 'Resume sessions on boot', fr: 'Reprendre les sessions au démarrage' },
            hint: {
              en: 'When the server starts, continues the sessions that were running when it stopped. Each one makes an LLM call, in parallel. Applies on the next start.',
              fr: 'Au démarrage du serveur, relance les sessions qui tournaient à son arrêt. Chacune fait un appel LLM, en parallèle. S’applique au prochain démarrage.',
            },
          },
          {
            key: 'agent.allowParallelSubAgents',
            label: { en: 'Parallel sub-agents', fr: 'Sous-agents en parallèle' },
            hint: {
              en: 'Runs the sub-agents of a same batch at the same time. Off, they run one after the other, which saves context and compute on local models.',
              fr: 'Lance en même temps les sous-agents d’un même lot. Décoché, ils s’exécutent l’un après l’autre, ce qui économise le contexte et le calcul sur les modèles locaux.',
            },
          },
          {
            key: 'display.showOpenInEditorLinks',
            label: { en: 'Open-in-editor links', fr: 'Liens vers l’éditeur' },
            hint: {
              en: 'Adds a link on file reads to open the file directly in VS Code.',
              fr: 'Ajoute sur les lectures de fichiers un lien pour ouvrir le fichier directement dans VS Code.',
            },
          },
        ]}
      />
      <DefaultAgentSetting />
      <TextSetting
        settingKey="network.proxyUrl"
        label={{ en: 'Proxy URL', fr: 'URL du proxy' }}
        hint={{
          en: 'Sends all OpenFox network requests through this proxy (AI, model fetching, web search, terminal). Leave empty for a direct connection.',
          fr: 'Fait passer toutes les requêtes réseau d’OpenFox par ce proxy (IA, récupération des modèles, recherche web, terminal). Laissez vide pour une connexion directe.',
        }}
      />
      <TestButton
        testId="proxy-test"
        label={{ en: 'Test proxy', fr: 'Tester le proxy' }}
        run={() => authFetch('/api/proxy/test', { method: 'POST' })}
      />
      <RetryPatternsSetting />
      <TextSetting
        settingKey="editor.vscodeRemotePrefix"
        label={{ en: 'VS Code remote prefix', fr: 'Préfixe distant VS Code' }}
        hint={{
          en: 'Added to every open-in-editor link to open files on a remote host over SSH. Leave empty for a local or WSL machine.',
          fr: 'Ajouté à chaque lien vers l’éditeur pour ouvrir les fichiers sur un hôte distant via SSH. Laissez vide pour une machine locale ou WSL.',
        }}
      />
    </>
  )
}
