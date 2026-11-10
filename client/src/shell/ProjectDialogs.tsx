import { useEffect, useState, type ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { DangerLevel, Project } from '@shared/types.js'
import { formatRootDir, getRootDirBlockReason, suggestRootDirChild } from '@shared/workspace.js'
import { deleteProject } from '../actions'
import { getJson, sendJson } from '../api'
import { reloadProjects } from '../controller'
import { useLoad } from '../hooks'
import { t } from '../i18n'
import panelStyles from '../panels/Panels.module.css'
import { useApp, type AppDialog, type NamedItem } from '../store/app'
import {
  joinSetup,
  loadWorkspaceConfig,
  splitSetup,
  toggleServerOverride,
  toggleToolOverride,
  type McpOverride,
  type McpOverrides,
  type WorkspaceConfig,
} from './projectSettings'

type ProjectDialog = Extract<AppDialog, object>
type EffortGateDialog = Extract<AppDialog, { kind: 'effort-gate' }>

const close = () => useApp.setState({ appDialog: null })

function Frame({ title, testId, children }: { title: string; testId: string; children: ReactNode }) {
  return (
    <Dialog.Root open onOpenChange={(open) => !open && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className={panelStyles.overlay} />
        <Dialog.Content className={panelStyles.dialog} data-testid={testId} aria-describedby={undefined}>
          <div className={panelStyles.header}>
            <Dialog.Title className={panelStyles.title}>{title}</Dialog.Title>
            <Dialog.Close className={panelStyles.close} aria-label={t({ en: 'Close', fr: 'Fermer' })}>
              <X size={16} />
            </Dialog.Close>
          </div>
          <div className={panelStyles.body}>{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function DeleteProject({ projectId, name, workdir }: { projectId: string; name: string; workdir: string }) {
  const [deleteFiles, setDeleteFiles] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const confirm = () => {
    setBusy(true)
    setError(null)
    void deleteProject(projectId, deleteFiles)
      .catch(() => t({ en: 'The server could not be reached', fr: 'Le serveur est injoignable' }))
      .then((failure) => {
        if (failure === null) {
          close()
          return
        }
        setError(failure)
        setBusy(false)
      })
  }

  return (
    <Frame title={t({ en: 'Delete project', fr: 'Supprimer le projet' })} testId="delete-project-dialog">
      <p>
        {t(
          {
            en: 'This permanently deletes the project {{name}} and all its sessions from OpenFox.',
            fr: 'Cela supprime définitivement le projet {{name}} et toutes ses sessions d’OpenFox.',
          },
          { name },
        )}
      </p>
      <label className={panelStyles.checkRow}>
        <input
          type="checkbox"
          data-testid="delete-project-files"
          checked={deleteFiles}
          disabled={busy}
          onChange={(event) => setDeleteFiles(event.target.checked)}
        />
        <span>{t({ en: 'Also delete the folder from the disk', fr: 'Supprimer aussi le dossier du disque' })}</span>
      </label>
      <code className={panelStyles.muted}>{workdir}</code>
      {deleteFiles && (
        <p className={panelStyles.error} data-testid="delete-project-warning">
          {t({
            en: 'Every file in this folder will be lost. This cannot be undone.',
            fr: 'Tous les fichiers de ce dossier seront perdus. Cette action est irréversible.',
          })}
        </p>
      )}
      {error && (
        <p className={panelStyles.error} role="alert" data-testid="delete-project-error">
          {error}
        </p>
      )}
      <div className={panelStyles.row}>
        <span className={panelStyles.grow} />
        <button type="button" disabled={busy} onClick={close}>
          {t({ en: 'Cancel', fr: 'Annuler' })}
        </button>
        <button
          type="button"
          className={panelStyles.primary}
          data-testid="delete-project-confirm"
          disabled={busy}
          onClick={confirm}
        >
          {deleteFiles
            ? t({ en: 'Delete project and folder', fr: 'Supprimer le projet et le dossier' })
            : t({ en: 'Delete', fr: 'Supprimer' })}
        </button>
      </div>
    </Frame>
  )
}

type FixAction = 'group' | 'join_group' | 'join_group_and_group'

interface PermissionOptions {
  sudoAvailable: boolean
  userInGroup: boolean
  groupHasWrite: boolean
  groupName: string | null
}

function Permissions({ path, retry }: { path: string; retry: () => void }) {
  const { data: options } = useLoad<PermissionOptions>(
    () =>
      sendJson('/api/projects/check-permissions', 'POST', { path }).then((r) => r.json() as Promise<PermissionOptions>),
    path,
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const group = options?.groupName ?? ''

  const fix = async (action: FixAction) => {
    setBusy(true)
    setError(null)
    const response = await sendJson('/api/projects/fix-permissions', 'POST', { path, action }).catch(() => null)
    const data = (await response?.json().catch(() => null)) as { success?: boolean; error?: string } | null
    setBusy(false)
    if (data?.success) {
      close()
      retry()
      return
    }
    setError(data?.error ?? t({ en: 'Failed to fix permissions', fr: 'Échec de la correction des permissions' }))
  }

  const action = !options
    ? null
    : options.userInGroup
      ? {
          fix: 'group' as const,
          label: t({ en: 'Extend group permissions', fr: 'Étendre les permissions du groupe' }),
          command: `sudo chmod g+w "${path}"`,
        }
      : options.groupHasWrite
        ? {
            fix: 'join_group' as const,
            label: t({ en: 'Join group', fr: 'Rejoindre le groupe' }),
            command: `sudo usermod -aG ${group} $USER`,
          }
        : {
            fix: 'join_group_and_group' as const,
            label: t({ en: 'Join group and grant write access', fr: 'Rejoindre le groupe et accorder l’écriture' }),
            command: `sudo usermod -aG ${group} $USER\nsudo chmod g+w "${path}"`,
          }

  return (
    <Frame title={t({ en: 'Permission denied', fr: 'Permission refusée' })} testId="permissions-dialog">
      <p>
        {t(
          {
            en: 'OpenFox cannot write to this folder (group {{group}}):',
            fr: 'OpenFox ne peut pas écrire dans ce dossier (groupe {{group}}) :',
          },
          { group },
        )}
      </p>
      <code className={panelStyles.muted}>{path}</code>
      {error && <p className={panelStyles.error}>{error}</p>}
      {action && options?.sudoAvailable && (
        <button type="button" className={panelStyles.primary} disabled={busy} onClick={() => void fix(action.fix)}>
          {action.label}
        </button>
      )}
      {action && !options?.sudoAvailable && (
        <>
          <p className={panelStyles.muted}>
            {t({
              en: 'Passwordless sudo is not available. Run this manually:',
              fr: 'Le sudo sans mot de passe n’est pas disponible. Lancez ceci manuellement :',
            })}
          </p>
          <pre className={panelStyles.log}>{action.command}</pre>
        </>
      )}
    </Frame>
  )
}

interface McpServerInfo {
  name: string
  config: { disabled?: boolean }
  tools: Array<{ name: string }>
}

interface SettingsData {
  config: WorkspaceConfig
  servers: McpServerInfo[]
  agents: NamedItem[]
}

async function loadSettingsData(workdir: string): Promise<SettingsData> {
  const query = `workdir=${encodeURIComponent(workdir)}`
  const [config, { servers }, agents] = await Promise.all([
    loadWorkspaceConfig(workdir),
    getJson<{ servers: McpServerInfo[] }>('/api/mcp/servers').catch(() => ({ servers: [] })),
    getJson<{ defaults: NamedItem[]; userItems: NamedItem[]; projectItems: NamedItem[] }>(`/api/agents?${query}`),
  ])
  return {
    config,
    servers,
    agents: [...agents.defaults, ...agents.userItems, ...agents.projectItems],
  }
}

type RootDirPrompt = { kind: 'create'; path: string } | { kind: 'orphans'; workspaces: Array<{ name: string }> }

function SettingsForm({ project, data }: { project: Project; data: SettingsData }) {
  const [instructions, setInstructions] = useState(project.customInstructions ?? '')
  const [danger, setDanger] = useState<DangerLevel | ''>(project.dangerLevel ?? '')
  const [agent, setAgent] = useState(project.defaultAgent ?? '')
  const [setup, setSetup] = useState(joinSetup(data.config.setup))
  const [rootDir, setRootDir] = useState(data.config.rootDir ?? '')
  const [overrides, setOverrides] = useState<McpOverrides>(data.config.mcpOverrides ?? {})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [prompt, setPrompt] = useState<RootDirPrompt | null>(null)

  const workspaceChanged = () =>
    setup !== joinSetup(data.config.setup) ||
    rootDir.trim() !== (data.config.rootDir ?? '') ||
    JSON.stringify(overrides) !== JSON.stringify(data.config.mcpOverrides ?? {})

  const persist = async () => {
    const response = await sendJson(`/api/projects/${project.id}`, 'PUT', {
      customInstructions: instructions || null,
      dangerLevel: danger || null,
      ...(agent !== (project.defaultAgent ?? '') ? { defaultAgent: agent || null } : {}),
    })
    if (!response.ok) throw new Error(`${response.status}`)
    if (workspaceChanged()) {
      const saved = await sendJson(`/api/workspace/config?workdir=${encodeURIComponent(project.workdir)}`, 'POST', {
        setup: splitSetup(setup),
        rootDir: rootDir.trim(),
        mcpOverrides: overrides,
      })
      if (!saved.ok) throw new Error(`${saved.status}`)
    }
    await reloadProjects()
    close()
  }

  const run = (work: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    void work()
      .catch(() => setError(t({ en: 'Failed to save settings', fr: 'Échec de l’enregistrement des paramètres' })))
      .finally(() => setBusy(false))
  }

  const validate = async (createIfMissing: boolean) => {
    const response = await sendJson(
      `/api/workspace/config/validate?workdir=${encodeURIComponent(project.workdir)}`,
      'POST',
      { rootDir: rootDir.trim(), workdir: project.workdir, projectName: project.name, createIfMissing },
    )
    const result = (await response.json().catch(() => ({}))) as {
      error?: string
      exists?: boolean
      resolvedPath?: string
      workspaces?: Array<{ name: string }>
    }
    if (!response.ok) {
      setError(result.error ?? t({ en: 'Failed to validate settings', fr: 'Échec de la validation des paramètres' }))
      return
    }
    if (!result.exists) {
      setPrompt({ kind: 'create', path: result.resolvedPath ?? rootDir.trim() })
      return
    }
    if (result.workspaces?.length) {
      setPrompt({ kind: 'orphans', workspaces: result.workspaces })
      return
    }
    await persist()
  }

  const save = () => {
    const trimmed = rootDir.trim()
    if (trimmed === (data.config.rootDir ?? '') || !trimmed) {
      run(persist)
      return
    }
    const blocked = getRootDirBlockReason(trimmed)
    if (blocked === 'exact') {
      setError(
        t(
          {
            en: 'Cannot use "{{path}}" directly as workspace root. Use a subdirectory like "{{suggestion}}".',
            fr: 'Impossible d’utiliser « {{path}} » comme racine du workspace. Utilisez un sous-dossier comme « {{suggestion}} ».',
          },
          { path: formatRootDir(trimmed), suggestion: suggestRootDirChild(trimmed, project.name) },
        ),
      )
      return
    }
    if (blocked === 'virtual_fs') {
      setError(
        t(
          {
            en: 'Cannot use paths under "{{path}}" for workspaces.',
            fr: 'Impossible d’utiliser les chemins sous « {{path}} » pour les workspaces.',
          },
          { path: trimmed },
        ),
      )
      return
    }
    run(() => validate(false))
  }

  const serverDisabled = (server: McpServerInfo, override: McpOverride) =>
    override.disabled ?? Boolean(server.config.disabled)

  return (
    <div className={panelStyles.form}>
      <code className={panelStyles.muted}>{project.workdir}</code>
      <label className={panelStyles.field}>
        {t({ en: 'Project instructions', fr: 'Instructions du projet' })}
        <textarea
          className={panelStyles.textarea}
          data-testid="project-instructions"
          rows={5}
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
        />
      </label>
      <label className={panelStyles.field}>
        {t({ en: 'Default danger level', fr: 'Niveau de risque par défaut' })}
        <select
          className={panelStyles.select}
          value={danger}
          onChange={(event) => setDanger(event.target.value as DangerLevel | '')}
        >
          <option value="">{t({ en: 'Use the global default', fr: 'Utiliser le défaut global' })}</option>
          <option value="normal">{t({ en: 'Normal', fr: 'Normal' })}</option>
          <option value="dangerous">{t({ en: 'Dangerous', fr: 'Dangereux' })}</option>
        </select>
      </label>
      <label className={panelStyles.field}>
        {t({ en: 'Default agent', fr: 'Agent par défaut' })}
        <select className={panelStyles.select} value={agent} onChange={(event) => setAgent(event.target.value)}>
          <option value="">{t({ en: 'Use the system default', fr: 'Utiliser le défaut système' })}</option>
          {data.agents.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
          {agent && !data.agents.some((item) => item.id === agent) && (
            <option value={agent}>{t({ en: '{{agent}} (missing)', fr: '{{agent}} (introuvable)' }, { agent })}</option>
          )}
        </select>
      </label>
      <label className={panelStyles.field}>
        {t({
          en: 'Workspace setup command (chain with &&)',
          fr: 'Commande de préparation d’espace (enchaîner avec &&)',
        })}
        <input className={panelStyles.input} value={setup} onChange={(event) => setSetup(event.target.value)} />
      </label>
      <label className={panelStyles.field}>
        {t({ en: 'Workspace root directory', fr: 'Dossier racine des espaces' })}
        <input
          className={panelStyles.input}
          value={rootDir}
          onChange={(event) => {
            setRootDir(event.target.value)
            setPrompt(null)
          }}
        />
      </label>
      {data.servers.length > 0 && (
        <div className={panelStyles.stack}>
          <span className={panelStyles.eyebrow}>{t({ en: 'MCP servers', fr: 'Serveurs MCP' })}</span>
          {data.servers.map((server) => {
            const override = overrides[server.name] ?? {}
            const disabled = serverDisabled(server, override)
            return (
              <details key={server.name}>
                <summary>
                  <label className={panelStyles.check}>
                    <input
                      type="checkbox"
                      checked={!disabled}
                      onChange={() => setOverrides(toggleServerOverride(overrides, server.name, !disabled))}
                    />
                    {server.name}
                  </label>
                </summary>
                {server.tools.map((tool) => (
                  <label key={tool.name} className={panelStyles.check}>
                    <input
                      type="checkbox"
                      checked={!override.disabledTools?.includes(tool.name)}
                      onChange={() => setOverrides(toggleToolOverride(overrides, server.name, tool.name))}
                    />
                    {tool.name}
                  </label>
                ))}
              </details>
            )
          })}
        </div>
      )}
      {error && <p className={panelStyles.error}>{error}</p>}
      {prompt?.kind === 'create' && (
        <div className={panelStyles.row}>
          <span className={panelStyles.grow}>
            {t(
              { en: '{{path}} does not exist. Create it?', fr: '{{path}} n’existe pas. Le créer ?' },
              { path: prompt.path },
            )}
          </span>
          <button
            type="button"
            className={panelStyles.primary}
            disabled={busy}
            onClick={() => run(() => validate(true))}
          >
            {t({ en: 'Create', fr: 'Créer' })}
          </button>
        </div>
      )}
      {prompt?.kind === 'orphans' && (
        <div className={panelStyles.row}>
          <span className={panelStyles.grow}>
            {t(
              {
                en: 'These workspaces stay in the old location and leave this project: {{names}}',
                fr: 'Ces espaces restent à l’ancien emplacement et quittent ce projet : {{names}}',
              },
              { names: prompt.workspaces.map((workspace) => workspace.name).join(', ') },
            )}
          </span>
          <button type="button" className={panelStyles.primary} disabled={busy} onClick={() => run(persist)}>
            {t({ en: 'Confirm change', fr: 'Confirmer le changement' })}
          </button>
        </div>
      )}
      <div className={panelStyles.row}>
        <span className={panelStyles.grow} />
        <button type="button" onClick={close}>
          {t({ en: 'Cancel', fr: 'Annuler' })}
        </button>
        <button type="button" className={panelStyles.primary} data-testid="project-save" disabled={busy} onClick={save}>
          {t({ en: 'Save', fr: 'Enregistrer' })}
        </button>
      </div>
    </div>
  )
}

function ProjectSettings({ projectId }: { projectId: string }) {
  const project = useApp((state) => state.projects.find((item) => item.id === projectId))
  const { data } = useLoad(() => loadSettingsData(project?.workdir ?? ''), project?.workdir ?? '')
  return (
    <Frame title={t({ en: 'Project settings', fr: 'Paramètres du projet' })} testId="project-settings-dialog">
      {project && data && <SettingsForm project={project} data={data} />}
    </Frame>
  )
}

function EffortGate({ dialog }: { dialog: EffortGateDialog }) {
  const change =
    dialog.from && dialog.from !== dialog.to
      ? t(
          { en: '{{to}} (currently {{from}})', fr: '{{to}} (actuellement {{from}})' },
          { to: dialog.to, from: dialog.from },
        )
      : dialog.to
  return (
    <Dialog.Root open onOpenChange={(open) => !open && dialog.resolve(true)}>
      <Dialog.Portal>
        <Dialog.Overlay className={panelStyles.overlay} />
        <Dialog.Content className={panelStyles.dialog} data-testid="effort-gate" aria-describedby={undefined}>
          <div className={panelStyles.header}>
            <Dialog.Title className={panelStyles.title}>
              {t({ en: 'Reasoning effort change', fr: 'Changement d’effort de raisonnement' })}
            </Dialog.Title>
          </div>
          <div className={panelStyles.body}>
            <p>
              {dialog.label
                ? t(
                    {
                      en: '{{label}} runs with reasoning effort {{change}}.',
                      fr: '{{label}} s’exécute avec l’effort de raisonnement {{change}}.',
                    },
                    { label: dialog.label, change },
                  )
                : t(
                    {
                      en: 'Switching the reasoning effort to {{change}}.',
                      fr: 'Passage de l’effort de raisonnement à {{change}}.',
                    },
                    { change },
                  )}{' '}
              {t({
                en: 'This may invalidate the LLM prefix cache, so the next response can take longer.',
                fr: 'Cela peut invalider le cache de préfixe du LLM, et la prochaine réponse peut être plus lente.',
              })}
            </p>
            <div className={panelStyles.row}>
              <span className={panelStyles.grow} />
              <button type="button" data-testid="effort-keep" onClick={() => dialog.resolve(true)}>
                {t({ en: 'Keep current effort', fr: 'Conserver l’effort actuel' })}
              </button>
              <button
                type="button"
                className={panelStyles.primary}
                data-testid="effort-apply"
                onClick={() => dialog.resolve(false)}
              >
                {t({ en: 'Apply (invalidates cache)', fr: 'Appliquer (invalide le cache)' })}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export default function ProjectDialogs({ dialog }: { dialog: ProjectDialog }) {
  useEffect(() => {
    if (dialog.kind === 'project-settings') void reloadProjects()
  }, [dialog])
  if (dialog.kind === 'delete-project')
    return <DeleteProject projectId={dialog.projectId} name={dialog.name} workdir={dialog.workdir} />
  if (dialog.kind === 'effort-gate') return <EffortGate dialog={dialog} />
  if (dialog.kind === 'permissions') return <Permissions path={dialog.path} retry={dialog.retry} />
  return <ProjectSettings projectId={dialog.projectId} />
}
