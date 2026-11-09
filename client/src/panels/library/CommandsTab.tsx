import { useEffect, useState } from 'react'
import { Copy, Eye, Pencil, Plus } from 'lucide-react'
import { t } from '../../i18n'
import { useApp } from '../../store/app'
import panelStyles from '../Panels.module.css'
import { commandSlug } from './form'
import { DeleteButton, DestinationField, FormActions, Section } from './LibraryParts'
import { useLibrary, useProjectDir, type Destination } from './useLibrary'
import styles from './Library.module.css'

interface CommandInfo {
  id: string
  name: string
  agentMode?: string
  pluginId?: string
}

interface CommandFull {
  metadata: { id: string; name: string; agentMode?: string }
  prompt: string
}

interface Draft {
  id: string
  name: string
  agentMode: string
  prompt: string
  destination: Destination
}

type View =
  { mode: 'list' } | { mode: 'form'; editingId: string | null; readOnly: boolean; idEditable: boolean; draft: Draft }

function toDraft(item: CommandFull): Draft {
  return {
    id: item.metadata.id,
    name: item.metadata.name,
    agentMode: item.metadata.agentMode ?? '',
    prompt: item.prompt,
    destination: 'user',
  }
}

function copyOf(draft: Draft): Draft {
  return {
    ...draft,
    id: `${draft.id}-copy-${Date.now()}`,
    name: `${draft.name} ${t({ en: '(copy)', fr: '(copie)' })}`,
  }
}

export function CommandsTab() {
  const workdir = useProjectDir()
  const library = useLibrary<CommandInfo, CommandFull>('commands', workdir)
  const agents = useApp((state) => state.agents)
  const [view, setView] = useState<View>({ mode: 'list' })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const open = (editingId: string | null, readOnly: boolean, draft: Draft) => {
    setError(null)
    setView({ mode: 'form', editingId, readOnly, idEditable: !editingId && !readOnly, draft })
  }

  const load = (id: string, builtIn: boolean, then: (draft: Draft) => void) => {
    void library.getItem(id, builtIn).then((item) => then(toDraft(item)))
  }

  // Arriving from the composer's menu: only the loaded lists tell if it is built in
  useEffect(() => {
    const target = useApp.getState().settingsEdit
    if (!target || !library.data) return
    useApp.setState({ settingsEdit: null })
    const custom = [...library.data.userItems, ...library.data.projectItems].some((item) => item.id === target.id)
    load(target.id, !custom, (draft) => open(target.id, !custom, draft))
  }, [library.data])

  const save = async () => {
    if (view.mode !== 'form') return
    const { draft, editingId } = view
    setSaving(true)
    setError(null)
    const id = editingId ?? draft.id
    const item: CommandFull = {
      metadata: { id, name: draft.name, ...(draft.agentMode ? { agentMode: draft.agentMode } : {}) },
      prompt: draft.prompt,
    }
    const failure = editingId ? await library.update(editingId, item) : await library.create(item, draft.destination)
    setSaving(false)
    if (failure) setError(failure)
    else setView({ mode: 'list' })
  }

  if (view.mode === 'form') {
    const { draft, readOnly, editingId, idEditable } = view
    const patch = (change: Partial<Draft>) => setView({ ...view, draft: { ...draft, ...change } })
    return (
      <div className={panelStyles.stack} data-testid="command-form">
        {error && <p className={panelStyles.error}>{error}</p>}
        {!editingId && !readOnly && (
          <DestinationField
            value={draft.destination}
            projectAvailable={Boolean(workdir)}
            onChange={(destination) => patch({ destination })}
          />
        )}
        <div className={styles.twoColumns}>
          <label className={panelStyles.field}>
            {t({ en: 'Name', fr: 'Nom' })}
            <input
              className={panelStyles.input}
              data-testid="library-name"
              value={draft.name}
              readOnly={readOnly}
              placeholder={t({ en: 'My command', fr: 'Ma commande' })}
              onChange={(event) =>
                patch({ name: event.target.value, ...(idEditable ? { id: commandSlug(event.target.value) } : {}) })
              }
            />
          </label>
          <label className={panelStyles.field}>
            {t({ en: 'ID', fr: 'ID' })}
            <input
              className={`${panelStyles.input} ${styles.mono}`}
              value={draft.id}
              readOnly={!idEditable}
              onChange={(event) => patch({ id: event.target.value })}
            />
          </label>
        </div>
        <label className={panelStyles.field}>
          {t({ en: 'Agent mode (optional)', fr: 'Mode agent (facultatif)' })}
          <select
            className={panelStyles.input}
            value={draft.agentMode}
            disabled={readOnly}
            onChange={(event) => patch({ agentMode: event.target.value })}
          >
            <option value="">{t({ en: 'None (keep current mode)', fr: 'Aucun (conserver le mode actuel)' })}</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
        </label>
        <label className={panelStyles.field}>
          {t({ en: 'Message', fr: 'Message' })}
          <textarea
            className={panelStyles.textarea}
            data-testid="library-prompt"
            value={draft.prompt}
            readOnly={readOnly}
            placeholder={t({
              en: 'The message sent when this command is triggered…',
              fr: 'Le message envoyé lorsque cette commande est déclenchée…',
            })}
            onChange={(event) => patch({ prompt: event.target.value })}
          />
        </label>
        {readOnly ? (
          <div className={panelStyles.row}>
            <span className={panelStyles.grow} />
            <button type="button" onClick={() => setView({ mode: 'list' })}>
              {t({ en: 'Close', fr: 'Fermer' })}
            </button>
            <button type="button" className={panelStyles.primary} onClick={() => open(null, false, copyOf(draft))}>
              {t({ en: 'Duplicate and customize', fr: 'Dupliquer et personnaliser' })}
            </button>
          </div>
        ) : (
          <FormActions
            saving={saving}
            canSave={Boolean(draft.id && draft.name && draft.prompt)}
            onCancel={() => setView({ mode: 'list' })}
            onSave={() => void save()}
          />
        )}
      </div>
    )
  }

  const row = (command: CommandInfo, builtIn: boolean) => (
    <div key={command.id} className={styles.row} data-testid={`command-${command.id}`}>
      <span className={panelStyles.grow}>
        {command.name}
        {command.pluginId && <span className={styles.tag}>{t({ en: 'Plugin', fr: 'Plugin' })}</span>}
      </span>
      {builtIn ? (
        <button
          type="button"
          aria-label={t({ en: 'View', fr: 'Voir' })}
          onClick={() => load(command.id, true, (draft) => open(command.id, true, draft))}
        >
          <Eye size={13} />
        </button>
      ) : (
        <button
          type="button"
          aria-label={t({ en: 'Edit', fr: 'Modifier' })}
          data-testid="command-edit"
          onClick={() => load(command.id, false, (draft) => open(command.id, false, draft))}
        >
          <Pencil size={13} />
        </button>
      )}
      <button
        type="button"
        aria-label={t({ en: 'Duplicate', fr: 'Dupliquer' })}
        onClick={() => load(command.id, builtIn, (draft) => open(null, false, copyOf(draft)))}
      >
        <Copy size={13} />
      </button>
      {!builtIn && <DeleteButton onConfirm={() => void library.remove(command.id).then(setError)} />}
    </div>
  )

  return (
    <div className={panelStyles.stack} data-testid="commands-tab">
      <div className={panelStyles.row}>
        <span className={`${panelStyles.muted} ${panelStyles.grow}`}>
          {t({
            en: 'Commands are pre-defined messages you can send with a single click.',
            fr: 'Les commandes sont des messages prédéfinis que vous pouvez envoyer en un seul clic.',
          })}
        </span>
        <button
          type="button"
          className={panelStyles.primary}
          data-testid="library-new"
          onClick={() => open(null, false, { id: '', name: '', agentMode: '', prompt: '', destination: 'user' })}
        >
          <Plus size={12} /> {t({ en: 'New', fr: 'Nouveau' })}
        </button>
      </div>
      {error && <p className={panelStyles.error}>{error}</p>}
      {(library.data?.defaults.length ?? 0) > 0 && (
        <Section title={t({ en: 'Built-in', fr: 'Intégrées' })}>
          {library.data!.defaults.map((command) => row(command, true))}
        </Section>
      )}
      {(library.data?.userItems.length ?? 0) > 0 && (
        <Section title={t({ en: 'Global', fr: 'Global' })}>
          {library.data!.userItems.map((command) => row(command, false))}
        </Section>
      )}
      {(library.data?.projectItems.length ?? 0) > 0 && (
        <Section title={t({ en: 'Project', fr: 'Projet' })}>
          {library.data!.projectItems.map((command) => row(command, false))}
        </Section>
      )}
    </div>
  )
}
