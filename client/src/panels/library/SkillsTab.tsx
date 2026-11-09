import { useRef, useState, type DragEvent, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, Copy, Eye, Pencil, Plus } from 'lucide-react'
import { authFetch, sendJson } from '../../api'
import { t } from '../../i18n'
import { DirectoryList, useDirectoryBrowser } from '../../shell/DirectoryBrowser'
import panelStyles from '../Panels.module.css'
import { commandSlug } from './form'
import { DeleteButton, DestinationField, FormActions, Section } from './LibraryParts'
import { packageFromDrop, packageFromFileList, type SkillPackage } from './skillPackage'
import { useLibrary, useProjectDir, type Destination, type LibraryLists } from './useLibrary'
import styles from './Library.module.css'

interface SkillInfo {
  id: string
  name: string
  description: string
  group?: string
  estimatedTokens?: number
  enabled: boolean
  source: string
  path: string | null
  readOnly: boolean
}

interface SkillFolder {
  configuredPath: string
  resolvedPath: string | null
  available: boolean
  custom: boolean
}

type SkillLists = LibraryLists<SkillInfo> & {
  items: SkillInfo[]
  selectedDirectory: SkillFolder | null
  diagnostics: string[]
}

interface SkillFull {
  metadata: { id: string; name: string; description: string; version: string }
  prompt: string
}

interface Draft {
  id: string
  name: string
  description: string
  version: string
  prompt: string
  destination: Destination
}

type View = { mode: 'list' } | { mode: 'form'; editingId: string | null; readOnly: boolean; draft: Draft }

const SHARED_SOURCES = ['global-shared', 'selected', 'project-shared']
const EMPTY_DRAFT: Draft = { id: '', name: '', description: '', version: '1.0.0', prompt: '', destination: 'user' }

const toDraft = ({ metadata, prompt }: SkillFull): Draft => ({
  id: metadata.id,
  name: metadata.name,
  description: metadata.description ?? '',
  version: metadata.version ?? '1.0.0',
  prompt,
  destination: 'user',
})

const copyOf = (draft: Draft): Draft => ({
  ...draft,
  id: `${draft.id}-copy-${Date.now()}`,
  name: `${draft.name} ${t({ en: '(copy)', fr: '(copie)' })}`,
})

const reasonOf = (error: unknown) =>
  error instanceof Error ? error.message : t({ en: 'Action failed', fr: 'Action échouée' })

function SkillFolderPanel({
  folder,
  choose,
  useDefault,
  refresh,
  install,
}: {
  folder: SkillFolder | null
  choose: (path: string) => Promise<string | null>
  useDefault: () => void
  refresh: () => void
  install: (skillPackage: SkillPackage) => Promise<string | null>
}) {
  const [path, setPath] = useState('')
  const { directory, browse } = useDirectoryBrowser(setPath)
  const [choosing, setChoosing] = useState(false)
  const [trusting, setTrusting] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const picker = useRef<HTMLInputElement | null>(null)
  const ready = folder?.available === true && !installing

  const run = async (read: () => SkillPackage | Promise<SkillPackage>) => {
    setError(null)
    setInstalling(true)
    try {
      setError(await install(await read()))
    } catch (failure) {
      setError(reasonOf(failure))
    }
    setInstalling(false)
  }

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    if (ready) void run(() => packageFromDrop(event.dataTransfer))
  }

  const confirm = async () => {
    const failure = await choose(path)
    setError(failure)
    setTrusting(false)
    if (!failure) setChoosing(false)
  }

  return (
    <section className={styles.rowBlock} data-testid="skill-folder">
      <div className={panelStyles.row}>
        <span className={panelStyles.grow}>
          {t({ en: 'Skills folder', fr: 'Dossier des compétences' })}
          <div className={`${panelStyles.muted} ${styles.mono}`}>
            {folder?.configuredPath ?? t({ en: 'No shared folder selected', fr: 'Aucun dossier partagé sélectionné' })}
          </div>
        </span>
        <button
          type="button"
          data-testid="skill-folder-change"
          onClick={() => {
            setChoosing(!choosing)
            if (!choosing) browse(folder?.resolvedPath ?? '')
          }}
        >
          {t({ en: 'Change folder', fr: 'Changer de dossier' })}
        </button>
        <button type="button" onClick={refresh}>
          {t({ en: 'Refresh', fr: 'Actualiser' })}
        </button>
        {folder?.custom && (
          <button type="button" data-testid="skill-folder-default" onClick={useDefault}>
            {t({ en: 'Use default', fr: 'Utiliser le défaut' })}
          </button>
        )}
      </div>
      {choosing && (
        <>
          <input className={panelStyles.input} value={path} onChange={(event) => setPath(event.target.value)} />
          <DirectoryList directory={directory} browse={browse} />
          {trusting ? (
            <div className={styles.inlineForm} data-testid="skill-folder-trust">
              <p>
                {t({
                  en: 'Skills may contain instructions and scripts. Use this folder? Nothing in it is run when it is read.',
                  fr: 'Les compétences peuvent contenir des instructions et des scripts. Utiliser ce dossier ? Rien n’y est exécuté à la lecture.',
                })}
              </p>
              <div className={panelStyles.row}>
                <span className={panelStyles.grow} />
                <button type="button" onClick={() => setTrusting(false)}>
                  {t({ en: 'Cancel', fr: 'Annuler' })}
                </button>
                <button
                  type="button"
                  className={panelStyles.primary}
                  data-testid="skill-folder-confirm"
                  onClick={() => void confirm()}
                >
                  {t({ en: 'Trust this folder', fr: 'Faire confiance à ce dossier' })}
                </button>
              </div>
            </div>
          ) : (
            <div className={panelStyles.row}>
              <span className={panelStyles.grow} />
              <button type="button" data-testid="skill-folder-use" disabled={!path} onClick={() => setTrusting(true)}>
                {t({ en: 'Use this folder', fr: 'Utiliser ce dossier' })}
              </button>
            </div>
          )}
        </>
      )}
      <button
        type="button"
        className={styles.dropZone}
        data-testid="skill-drop"
        disabled={!ready}
        onClick={() => picker.current?.click()}
        onDragOver={(event) => event.preventDefault()}
        onDrop={onDrop}
      >
        {!folder?.available
          ? t({
              en: 'Choose a skills folder to install from here.',
              fr: 'Choisissez un dossier de compétences pour installer depuis ici.',
            })
          : installing
            ? t({ en: 'Installing…', fr: 'Installation…' })
            : t({
                en: 'Drop a skill folder here, or click to choose one',
                fr: 'Déposez un dossier de compétence ici, ou cliquez pour le choisir',
              })}
      </button>
      <input
        ref={(element) => {
          picker.current = element
          element?.setAttribute('webkitdirectory', '')
        }}
        type="file"
        hidden
        multiple
        data-testid="skill-picker"
        onChange={(event) => {
          const { files } = event.target
          if (files?.length) void run(() => packageFromFileList(files)).finally(() => (event.target.value = ''))
        }}
      />
      {error && <p className={panelStyles.error}>{error}</p>}
    </section>
  )
}

function SkillGroup({
  name,
  skills,
  children,
  onToggle,
}: {
  name: string
  skills: SkillInfo[]
  children: ReactNode
  onToggle: () => void
}) {
  const [open, setOpen] = useState(false)
  const Chevron = open ? ChevronDown : ChevronRight
  const allEnabled = skills.every((skill) => skill.enabled)
  return (
    <div className={styles.rows}>
      <div className={styles.row}>
        <input
          type="checkbox"
          checked={allEnabled}
          aria-label={t(
            { en: 'Toggle all skills in {{group}}', fr: 'Basculer toutes les compétences de {{group}}' },
            { group: name },
          )}
          onChange={onToggle}
        />
        <button type="button" className={panelStyles.grow} onClick={() => setOpen(!open)}>
          {`${name} (${skills.length})`}
        </button>
        <button type="button" aria-label={name} onClick={() => setOpen(!open)}>
          <Chevron size={13} />
        </button>
      </div>
      {open && children}
    </div>
  )
}

export function SkillsTab() {
  const workdir = useProjectDir()
  const library = useLibrary<SkillInfo, SkillFull>('skills', workdir)
  const data = library.data as SkillLists | null
  const [view, setView] = useState<View>({ mode: 'list' })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const open = (editingId: string | null, readOnly: boolean, draft: Draft) => {
    setError(null)
    setView({ mode: 'form', editingId, readOnly, draft })
  }

  const isDefault = (id: string) => data?.defaults.some((skill) => skill.id === id) ?? false
  const load = (id: string, then: (draft: Draft) => void) => {
    void library.getItem(id, isDefault(id)).then((item) => then(toDraft(item)))
  }

  const toggle = (id: string) =>
    library.send(authFetch(library.url(`/${encodeURIComponent(id)}/toggle`), { method: 'POST' }))

  const install = async (skillPackage: SkillPackage) => {
    const body = new FormData()
    body.append('packageName', skillPackage.packageName)
    body.append('paths', JSON.stringify(skillPackage.files.map((entry) => entry.path)))
    for (const entry of skillPackage.files) body.append('files', entry.file, entry.file.name)
    return library.send(authFetch('/api/skills/install', { method: 'POST', body }))
  }

  const save = async () => {
    if (view.mode !== 'form') return
    const { draft, editingId } = view
    setSaving(true)
    setError(null)
    const id = editingId ?? draft.id
    const item: SkillFull = {
      metadata: { id, name: draft.name, description: draft.description, version: draft.version },
      prompt: draft.prompt,
    }
    const failure = editingId ? await library.update(editingId, item) : await library.create(item, draft.destination)
    setSaving(false)
    if (failure) setError(failure)
    else setView({ mode: 'list' })
  }

  if (view.mode === 'form') {
    const { draft, readOnly, editingId } = view
    const isNew = !editingId && !readOnly
    const patch = (change: Partial<Draft>) => setView({ ...view, draft: { ...draft, ...change } })
    return (
      <div className={panelStyles.stack} data-testid="skill-form">
        {error && <p className={panelStyles.error}>{error}</p>}
        {isNew && (
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
              data-testid="skill-name"
              value={draft.name}
              readOnly={readOnly}
              placeholder={t({ en: 'My skill', fr: 'Ma compétence' })}
              onChange={(event) =>
                patch({ name: event.target.value, ...(isNew ? { id: commandSlug(event.target.value) } : {}) })
              }
            />
          </label>
          <label className={panelStyles.field}>
            {t({ en: 'ID', fr: 'ID' })}
            <input
              className={`${panelStyles.input} ${styles.mono}`}
              data-testid="skill-id"
              value={draft.id}
              readOnly={!isNew}
              onChange={(event) => patch({ id: event.target.value })}
            />
          </label>
        </div>
        <div className={styles.twoColumns}>
          <label className={panelStyles.field}>
            {t({ en: 'Description', fr: 'Description' })}
            <input
              className={panelStyles.input}
              data-testid="skill-description"
              value={draft.description}
              readOnly={readOnly}
              placeholder={t({ en: 'What this skill does…', fr: 'Ce que fait cette compétence…' })}
              onChange={(event) => patch({ description: event.target.value })}
            />
          </label>
          <label className={panelStyles.field}>
            {t({ en: 'Version', fr: 'Version' })}
            <input
              className={panelStyles.input}
              value={draft.version}
              readOnly={readOnly}
              onChange={(event) => patch({ version: event.target.value })}
            />
          </label>
        </div>
        <label className={panelStyles.field}>
          {t({ en: 'Instructions', fr: 'Instructions' })}
          <textarea
            className={panelStyles.textarea}
            data-testid="skill-prompt"
            value={draft.prompt}
            readOnly={readOnly}
            placeholder={t({
              en: 'What the agent should know or do when it loads this skill…',
              fr: 'Ce que l’agent doit savoir ou faire quand il charge cette compétence…',
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
            canSave={Boolean(draft.id && draft.name.trim() && draft.description.trim() && draft.prompt.trim())}
            onCancel={() => setView({ mode: 'list' })}
            onSave={() => void save()}
          />
        )}
      </div>
    )
  }

  const row = (skill: SkillInfo) => {
    const locked = isDefault(skill.id) || skill.readOnly || skill.source === 'plugin'
    return (
      <div
        key={`${skill.source}-${skill.id}`}
        className={styles.row}
        data-testid={`skill-${skill.id}`}
        title={skill.path ?? undefined}
      >
        <input
          type="checkbox"
          checked={skill.enabled}
          aria-label={t({ en: 'Activation for {{name}}', fr: 'Activation pour {{name}}' }, { name: skill.name })}
          onChange={() => void toggle(skill.id).then(setError)}
        />
        <span className={panelStyles.grow}>
          {skill.name}
          {(skill.estimatedTokens ?? 0) > 0 && <span className={styles.tag}>{`~${skill.estimatedTokens} tokens`}</span>}
          {skill.description && <div className={panelStyles.muted}>{skill.description}</div>}
        </span>
        {locked ? (
          <button
            type="button"
            aria-label={t({ en: 'View', fr: 'Voir' })}
            data-testid="skill-view"
            onClick={() => load(skill.id, (draft) => open(skill.id, true, draft))}
          >
            <Eye size={13} />
          </button>
        ) : (
          <button
            type="button"
            aria-label={t({ en: 'Edit', fr: 'Modifier' })}
            data-testid="skill-edit"
            onClick={() => load(skill.id, (draft) => open(skill.id, false, draft))}
          >
            <Pencil size={13} />
          </button>
        )}
        <button
          type="button"
          aria-label={t({ en: 'Duplicate', fr: 'Dupliquer' })}
          data-testid="skill-duplicate"
          onClick={() => load(skill.id, (draft) => open(null, false, copyOf(draft)))}
        >
          <Copy size={13} />
        </button>
        {!locked && <DeleteButton onConfirm={() => void library.remove(skill.id).then(setError)} />}
      </div>
    )
  }

  const toggleGroup = (skills: SkillInfo[]) => {
    const target = !skills.every((skill) => skill.enabled)
    void Promise.all(skills.filter((skill) => skill.enabled !== target).map((skill) => toggle(skill.id)))
  }

  const list = (skills: SkillInfo[]) => {
    const groups = [...new Set(skills.flatMap((skill) => skill.group ?? []))].sort()
    return (
      <>
        {skills.filter((skill) => !skill.group).map(row)}
        {groups.map((group) => {
          const members = skills.filter((skill) => skill.group === group)
          return (
            <SkillGroup key={group} name={group} skills={members} onToggle={() => toggleGroup(members)}>
              {members.map(row)}
            </SkillGroup>
          )
        })}
      </>
    )
  }

  const shared = data?.items.filter((skill) => SHARED_SOURCES.includes(skill.source)) ?? []
  const sections = [
    { title: t({ en: 'Built-in', fr: 'Intégrées' }), skills: data?.defaults ?? [] },
    { title: t({ en: 'Global', fr: 'Globales' }), skills: data?.userItems ?? [] },
    { title: t({ en: 'Shared', fr: 'Partagées' }), skills: shared },
    { title: t({ en: 'Project', fr: 'Projet' }), skills: data?.projectItems ?? [] },
    {
      title: t({ en: 'Plugins', fr: 'Plugins' }),
      skills: data?.items.filter((skill) => skill.source === 'plugin') ?? [],
    },
  ]

  return (
    <div className={panelStyles.stack} data-testid="skills-tab">
      <div className={panelStyles.row}>
        <span className={`${panelStyles.muted} ${panelStyles.grow}`}>
          {t({
            en: 'Skills provide domain-specific knowledge that agents can load on demand.',
            fr: 'Les compétences fournissent des connaissances spécifiques que les agents peuvent charger à la demande.',
          })}
        </span>
        <button
          type="button"
          className={panelStyles.primary}
          data-testid="skill-new"
          onClick={() => open(null, false, EMPTY_DRAFT)}
        >
          <Plus size={12} /> {t({ en: 'New', fr: 'Nouvelle' })}
        </button>
      </div>
      {error && <p className={panelStyles.error}>{error}</p>}
      <SkillFolderPanel
        folder={data?.selectedDirectory ?? null}
        choose={(path) => library.send(sendJson('/api/skills/library', 'PUT', { path }))}
        useDefault={() => void library.send(authFetch('/api/skills/library', { method: 'DELETE' })).then(setError)}
        refresh={library.reload}
        install={install}
      />
      {data?.diagnostics.map((diagnostic) => (
        <p key={diagnostic} className={panelStyles.muted}>
          {diagnostic}
        </p>
      ))}
      {sections.map(
        ({ title, skills }) =>
          skills.length > 0 && (
            <Section key={title} title={title}>
              {list(skills)}
            </Section>
          ),
      )}
    </div>
  )
}
