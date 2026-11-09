import { useEffect, useState } from 'react'
import { Copy, Eye, Pencil, Plus, Cpu } from 'lucide-react'
import { authFetch, getJson, sendJson } from '../../api'
import { useLoad } from '../../hooks'
import { t } from '../../i18n'
import { PluginZone, usePluginContext } from '../../plugins/Slots'
import { useApp } from '../../store/app'
import { ModelField } from '../ModelField'
import panelStyles from '../Panels.module.css'
import { agentSlug } from './form'
import { DeleteButton, DestinationField, FormActions, Section } from './LibraryParts'
import { ToolPicker, type AvailableTool } from './ToolPicker'
import { useLibrary, useProjectDir, type Destination } from './useLibrary'
import styles from './Library.module.css'

const DEFAULT_COLOR = '#6b7280'

interface AgentMetadata {
  id: string
  name: string
  description: string
  subagent: boolean
  allowedTools: string[]
  color?: string
}

type AgentFull = { metadata: AgentMetadata; prompt: string }
type AgentInfo = AgentMetadata

interface ModelChoice {
  providerId: string | undefined
  model: string | undefined
  effort: string | undefined
}

const NO_MODEL: ModelChoice = { providerId: undefined, model: undefined, effort: undefined }

interface Draft {
  metadata: AgentMetadata
  prompt: string
  destination: Destination
  model: ModelChoice
}

type View = { mode: 'list' } | { mode: 'form'; editingId: string | null; readOnly: boolean; draft: Draft }

async function loadModel(agentId: string): Promise<ModelChoice> {
  const data = await getJson<{ providerId?: string; model?: string; reasoningEffort?: string }>(
    `/api/agents/${encodeURIComponent(agentId)}/model`,
  ).catch(() => null)
  return data?.providerId && data.model
    ? { providerId: data.providerId, model: data.model, effort: data.reasoningEffort }
    : NO_MODEL
}

async function saveModel(agentId: string, choice: ModelChoice): Promise<void> {
  const url = `/api/agents/${encodeURIComponent(agentId)}/model`
  if (choice.providerId && choice.model) {
    await sendJson(url, 'PUT', {
      providerId: choice.providerId,
      model: choice.model,
      ...(choice.effort ? { reasoningEffort: choice.effort } : {}),
    })
  } else {
    await authFetch(url, { method: 'DELETE' })
  }
}

function ModelChooser({
  value,
  defaultLabel,
  onChange,
}: {
  value: ModelChoice
  defaultLabel: string
  onChange: (choice: ModelChoice) => void
}) {
  const providers = useApp((state) => state.providers)
  const efforts =
    providers.find((provider) => provider.id === value.providerId)?.models.find((model) => model.id === value.model)
      ?.reasoningEfforts ?? []
  return (
    <div className={panelStyles.row}>
      <div className={panelStyles.grow}>
        <ModelField
          providerId={value.providerId}
          model={value.model}
          defaultLabel={defaultLabel}
          onChange={(providerId, model) => onChange({ providerId, model, effort: undefined })}
        />
      </div>
      {efforts.length > 0 && (
        <select
          className={panelStyles.select}
          aria-label={t({ en: 'Reasoning effort', fr: 'Effort de raisonnement' })}
          value={value.effort ?? ''}
          onChange={(event) => onChange({ ...value, effort: event.target.value || undefined })}
        >
          <option value="">{t({ en: 'Default effort', fr: 'Effort par défaut' })}</option>
          {efforts.map((effort) => (
            <option key={effort} value={effort}>
              {effort}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}

function BuiltInModel({ agentId, onDone }: { agentId: string; onDone: () => void }) {
  const [choice, setChoice] = useState<ModelChoice | null>(null)
  useEffect(() => {
    void loadModel(agentId).then(setChoice)
  }, [agentId])
  if (!choice) return null
  return (
    <div className={styles.inlineForm} data-testid="agent-model-form">
      <p className={panelStyles.muted}>
        {t({
          en: 'Choose which model to use when this agent is active. This overrides the session and global model.',
          fr: 'Choisissez le modèle à utiliser lorsque cet agent est actif. Il remplace le modèle de la session et le modèle global.',
        })}
      </p>
      <ModelChooser
        value={choice}
        defaultLabel={t({ en: 'Default (global model)', fr: 'Défaut (modèle global)' })}
        onChange={setChoice}
      />
      <FormActions
        saving={false}
        canSave
        onCancel={onDone}
        onSave={() => {
          void saveModel(agentId, choice).then(onDone)
        }}
      />
    </div>
  )
}

function AgentForm({
  view,
  tools,
  projectAvailable,
  error,
  saving,
  onChange,
  onCopy,
  onCancel,
  onSave,
}: {
  view: Extract<View, { mode: 'form' }>
  tools: AvailableTool[]
  projectAvailable: boolean
  error: string | null
  saving: boolean
  onChange: (draft: Draft) => void
  onCopy: () => void
  onCancel: () => void
  onSave: () => void
}) {
  const { draft, editingId, readOnly } = view
  const { metadata } = draft
  const patch = (change: Partial<AgentMetadata>) => onChange({ ...draft, metadata: { ...metadata, ...change } })

  return (
    <div className={panelStyles.stack} data-testid="agent-form">
      {error && <p className={panelStyles.error}>{error}</p>}
      {!editingId && !readOnly && (
        <DestinationField
          value={draft.destination}
          projectAvailable={projectAvailable}
          onChange={(destination) => onChange({ ...draft, destination })}
        />
      )}
      <div className={styles.twoColumns}>
        <label className={panelStyles.field}>
          {t({ en: 'Name', fr: 'Nom' })}
          <input
            className={panelStyles.input}
            data-testid="library-name"
            value={metadata.name}
            readOnly={readOnly}
            placeholder={t({ en: 'My agent', fr: 'Mon agent' })}
            onChange={(event) =>
              patch({ name: event.target.value, ...(editingId ? {} : { id: agentSlug(event.target.value) }) })
            }
          />
        </label>
        <label className={panelStyles.field}>
          {t({ en: 'ID (read-only)', fr: 'ID (lecture seule)' })}
          <input className={`${panelStyles.input} ${styles.mono}`} value={metadata.id} readOnly />
        </label>
        <label className={panelStyles.field}>
          {t({ en: 'Description', fr: 'Description' })}
          <input
            className={panelStyles.input}
            value={metadata.description}
            readOnly={readOnly}
            placeholder={t({ en: 'What this agent does', fr: 'Ce que fait cet agent' })}
            onChange={(event) => patch({ description: event.target.value })}
          />
        </label>
        <div className={panelStyles.field}>
          <span>{t({ en: 'Type', fr: 'Type' })}</span>
          <div className={styles.chips}>
            <button
              type="button"
              className={styles.chip}
              aria-pressed={!metadata.subagent}
              disabled={readOnly}
              onClick={() => patch({ subagent: false })}
            >
              {t({ en: 'Agent', fr: 'Agent' })}
            </button>
            <button
              type="button"
              className={styles.chip}
              aria-pressed={metadata.subagent}
              disabled={readOnly}
              onClick={() =>
                patch({
                  subagent: true,
                  allowedTools: metadata.allowedTools.filter(
                    (name) => !tools.find((tool) => name.split(':')[0] === tool.name)?.topLevelOnly,
                  ),
                })
              }
            >
              {t({ en: 'Sub-agent', fr: 'Sous-agent' })}
            </button>
            <label className={panelStyles.check}>
              {t({ en: 'Color', fr: 'Couleur' })}
              <input
                type="color"
                value={metadata.color ?? DEFAULT_COLOR}
                disabled={readOnly}
                onChange={(event) => patch({ color: event.target.value })}
              />
            </label>
          </div>
        </div>
      </div>
      {!readOnly && (
        <div className={panelStyles.field}>
          <span>{t({ en: 'Model override', fr: 'Remplacement du modèle' })}</span>
          <ModelChooser
            value={draft.model}
            defaultLabel={t({ en: 'Default (global model)', fr: 'Défaut (modèle global)' })}
            onChange={(model) => onChange({ ...draft, model })}
          />
        </div>
      )}
      <ToolPicker
        tools={tools}
        selected={metadata.allowedTools}
        subagent={metadata.subagent}
        readOnly={readOnly}
        onChange={(allowedTools) => patch({ allowedTools })}
      />
      <label className={panelStyles.field}>
        {t({ en: 'Prompt', fr: 'Invite' })}
        <textarea
          className={panelStyles.textarea}
          data-testid="library-prompt"
          value={draft.prompt}
          readOnly={readOnly}
          placeholder={t({ en: 'Instructions for this agent…', fr: 'Instructions pour cet agent…' })}
          onChange={(event) => onChange({ ...draft, prompt: event.target.value })}
        />
      </label>
      {readOnly ? (
        <div className={panelStyles.row}>
          <span className={panelStyles.grow} />
          <button type="button" onClick={onCancel}>
            {t({ en: 'Close', fr: 'Fermer' })}
          </button>
          <button type="button" className={panelStyles.primary} onClick={onCopy}>
            {t({ en: 'Duplicate and customize', fr: 'Dupliquer et personnaliser' })}
          </button>
        </div>
      ) : (
        <FormActions
          saving={saving}
          canSave={Boolean(metadata.id && metadata.name && draft.prompt)}
          onCancel={onCancel}
          onSave={onSave}
        />
      )}
    </div>
  )
}

function copyDraft(draft: Draft): Draft {
  return {
    ...draft,
    metadata: {
      ...draft.metadata,
      id: `${draft.metadata.id}-copy-${Date.now()}`,
      name: `${draft.metadata.name} ${t({ en: '(copy)', fr: '(copie)' })}`,
    },
  }
}

export function AgentsTab() {
  const context = usePluginContext()
  const workdir = useProjectDir()
  const library = useLibrary<AgentInfo, AgentFull>('agents', workdir)
  const tools = useLoad(() => getJson<{ tools: AvailableTool[] }>('/api/tools'), 'tools')
  const [view, setView] = useState<View>({ mode: 'list' })
  const [modelFor, setModelFor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const available = tools.data?.tools.filter((tool) => !tool.alwaysAllowed) ?? []
  const alwaysAllowed = new Set(tools.data?.tools.filter((tool) => tool.alwaysAllowed).map((tool) => tool.name))
  const defaults = library.data?.defaults ?? []
  const overrides = library.data?.modelOverrides ?? {}

  const toDraft = async (id: string, builtIn: boolean, withModel: boolean): Promise<Draft> => {
    const [item, model] = await Promise.all([
      library.getItem(id, builtIn),
      withModel ? loadModel(id) : Promise.resolve(NO_MODEL),
    ])
    return { metadata: { ...item.metadata }, prompt: item.prompt, destination: 'user', model }
  }

  const open = (editingId: string | null, readOnly: boolean, draft: Draft) => {
    setError(null)
    setView({ mode: 'form', editingId, readOnly, draft })
  }

  const openNew = () =>
    open(null, false, {
      metadata: {
        id: '',
        name: '',
        description: '',
        subagent: false,
        allowedTools: ['read_file'],
        color: DEFAULT_COLOR,
      },
      prompt: '',
      destination: 'user',
      model: NO_MODEL,
    })

  const save = async () => {
    if (view.mode !== 'form') return
    const { draft, editingId } = view
    setSaving(true)
    setError(null)
    const item: AgentFull = {
      metadata: {
        ...draft.metadata,
        allowedTools: draft.metadata.allowedTools.filter((name) => !alwaysAllowed.has(name)),
      },
      prompt: draft.prompt,
    }
    const failure = editingId ? await library.update(editingId, item) : await library.create(item, draft.destination)
    if (failure) {
      setError(failure)
    } else {
      await saveModel(editingId ?? draft.metadata.id, draft.model)
      library.reload()
      setView({ mode: 'list' })
    }
    setSaving(false)
  }

  if (view.mode === 'form') {
    return (
      <AgentForm
        view={view}
        tools={available}
        projectAvailable={Boolean(workdir)}
        error={error}
        saving={saving}
        onChange={(draft) => setView({ ...view, draft })}
        onCopy={() => open(null, false, copyDraft(view.draft))}
        onCancel={() => setView({ mode: 'list' })}
        onSave={() => void save()}
      />
    )
  }

  const row = (agent: AgentInfo, builtIn: boolean) => (
    <div key={agent.id} className={styles.rowBlock}>
      <div className={styles.row} data-testid={`agent-${agent.id}`}>
        <span className={styles.colorDot} style={{ background: agent.color ?? DEFAULT_COLOR }} />
        <span className={panelStyles.grow}>
          {agent.name}
          {agent.subagent && <span className={styles.tag}>{t({ en: 'Sub-agent', fr: 'Sous-agent' })}</span>}
          {overrides[agent.id] && <span className={styles.tag}>{overrides[agent.id]!.split('/').pop()}</span>}
          {agent.description && <div className={panelStyles.muted}>{agent.description}</div>}
        </span>
        <button
          type="button"
          aria-label={t({ en: 'View', fr: 'Voir' })}
          onClick={() => void toDraft(agent.id, builtIn, false).then((draft) => open(agent.id, true, draft))}
        >
          <Eye size={13} />
        </button>
        {builtIn ? (
          <button
            type="button"
            aria-label={t({ en: 'Model', fr: 'Modèle' })}
            data-testid="agent-model"
            onClick={() => setModelFor(modelFor === agent.id ? null : agent.id)}
          >
            <Cpu size={13} />
          </button>
        ) : (
          <button
            type="button"
            aria-label={t({ en: 'Edit', fr: 'Modifier' })}
            data-testid="agent-edit"
            onClick={() => void toDraft(agent.id, false, true).then((draft) => open(agent.id, false, draft))}
          >
            <Pencil size={13} />
          </button>
        )}
        <button
          type="button"
          aria-label={t({ en: 'Duplicate', fr: 'Dupliquer' })}
          onClick={() => void toDraft(agent.id, builtIn, false).then((draft) => open(null, false, copyDraft(draft)))}
        >
          <Copy size={13} />
        </button>
        {!builtIn && <DeleteButton onConfirm={() => void library.remove(agent.id).then(setError)} />}
      </div>
      {modelFor === agent.id && (
        <BuiltInModel
          agentId={agent.id}
          onDone={() => {
            setModelFor(null)
            library.reload()
          }}
        />
      )}
    </div>
  )

  return (
    <PluginZone id="agents.modal" context={context}>
      <div className={panelStyles.stack} data-testid="agents-tab">
        <div className={panelStyles.row}>
          <span className={`${panelStyles.muted} ${panelStyles.grow}`}>
            {t({
              en: 'Agents define behavior, tools and prompts for top-level modes and sub-agents.',
              fr: 'Les agents définissent le comportement, les outils et les invites des modes principaux et des sous-agents.',
            })}
          </span>
          <button type="button" className={panelStyles.primary} data-testid="library-new" onClick={openNew}>
            <Plus size={12} /> {t({ en: 'New', fr: 'Nouveau' })}
          </button>
        </div>
        {error && <p className={panelStyles.error}>{error}</p>}
        {defaults.length > 0 && (
          <Section title={t({ en: 'Built-in', fr: 'Intégrés' })}>{defaults.map((agent) => row(agent, true))}</Section>
        )}
        {(library.data?.userItems.length ?? 0) > 0 && (
          <Section title={t({ en: 'Global', fr: 'Global' })}>
            {library.data!.userItems.map((agent) => row(agent, false))}
          </Section>
        )}
        {(library.data?.projectItems.length ?? 0) > 0 && (
          <Section title={t({ en: 'Project', fr: 'Projet' })}>
            {library.data!.projectItems.map((agent) => row(agent, false))}
          </Section>
        )}
      </div>
    </PluginZone>
  )
}
