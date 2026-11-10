import { useMemo, useState } from 'react'
import { getJson, sendJson } from '../api'
import { reloadOpenSession } from '../controller'
import { useLoad } from '../hooks'
import { t } from '../i18n'
import { PluginZone, usePluginContext } from '../plugins/Slots'
import { useApp } from '../store/app'
import styles from './Panels.module.css'

interface Branches {
  branches: Array<{ name: string; current?: boolean }>
  defaultBranch: string
}

interface Workspace {
  name: string
  path?: string
}

function DeleteWorkspace({ onDelete }: { onDelete: (force: boolean) => Promise<string[] | null> }) {
  const [confirming, setConfirming] = useState(false)
  const [conflicts, setConflicts] = useState<string[] | null>(null)
  if (!confirming) {
    return (
      <button type="button" data-testid="workspace-delete" onClick={() => setConfirming(true)}>
        {t({ en: 'Delete', fr: 'Supprimer' })}
      </button>
    )
  }
  const run = (force: boolean) =>
    void onDelete(force).then((found) => {
      setConflicts(found)
      if (!found) setConfirming(false)
    })
  return (
    <>
      {conflicts && (
        <span className={styles.error} title={conflicts.join(', ')}>
          {t({ en: 'Used by other sessions', fr: 'Utilisé par d’autres sessions' })}
        </span>
      )}
      <button type="button" data-testid="workspace-delete-confirm" onClick={() => run(conflicts !== null)}>
        {conflicts
          ? t({ en: 'Force delete, switching them to original', fr: 'Forcer, en les basculant sur l’original' })
          : t({ en: 'Confirm', fr: 'Confirmer' })}
      </button>
      <button type="button" onClick={() => setConfirming(false)}>
        {t({ en: 'Cancel', fr: 'Annuler' })}
      </button>
    </>
  )
}

function GitPanelBody() {
  const sessionId = useApp((state) => state.session?.id)
  const projectId = useApp((state) => state.session?.projectId)
  const workspace = useApp((state) => state.session?.workspace)
  const currentBranch = useApp((state) => state.git?.branch)
  const [name, setName] = useState('')
  const [workspaceName, setWorkspaceName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [source, setSource] = useState('')
  const { data, reload } = useLoad(() => getJson<Branches>(`/api/sessions/${sessionId}/branches`), sessionId ?? '')
  const workspaces = useLoad(
    () => getJson<Workspace[] | { workspaces: Workspace[] }>(`/api/projects/${projectId}/workspaces`),
    projectId ?? '',
  )
  const workspaceList = Array.isArray(workspaces.data) ? workspaces.data : (workspaces.data?.workspaces ?? [])

  const run = async (path: string, body: unknown) => {
    setError(null)
    const response = await sendJson(`/api/sessions/${sessionId}/${path}`, 'POST', body)
    if (!response.ok) {
      setError(
        ((await response.json().catch(() => ({}))) as { error?: string }).error ??
          t({ en: 'Action failed', fr: 'Action échouée' }),
      )
      return
    }
    await reloadOpenSession()
    reload()
    workspaces.reload()
  }

  const needle = search.trim().toLowerCase()
  const branches = data?.branches.filter((branch) => branch.name.toLowerCase().includes(needle))

  const deleteWorkspace = async (target: string, force: boolean): Promise<string[] | null> => {
    setError(null)
    const response = await sendJson(`/api/sessions/${sessionId}/delete-workspace`, 'POST', { target, force })
    if (!response.ok) {
      const failure = (await response.json().catch(() => ({}))) as { error?: string; conflictingSessionIds?: string[] }
      setError(failure.error ?? t({ en: 'Failed to delete workspace', fr: 'Échec de la suppression de l’espace' }))
      return failure.conflictingSessionIds ?? null
    }
    await reloadOpenSession()
    workspaces.reload()
    return null
  }

  return (
    <div className={styles.stack}>
      {error && <p className={styles.error}>{error}</p>}
      <section>
        <h3 className={styles.eyebrow}>{t({ en: 'Branches', fr: 'Branches' })}</h3>
        <form
          className={styles.row}
          onSubmit={(event) => {
            event.preventDefault()
            if (name.trim())
              void run('checkout-new', { name: name.trim(), ...(source ? { sourceBranch: source } : {}) }).then(() =>
                setName(''),
              )
          }}
        >
          <input
            className={styles.input}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t({ en: 'New branch', fr: 'Nouvelle branche' })}
          />
          <select
            className={styles.select}
            aria-label={t({ en: 'From branch', fr: 'Depuis la branche' })}
            data-testid="branch-source"
            value={source}
            onChange={(event) => setSource(event.target.value)}
          >
            <option value="">
              {t({ en: 'From {{branch}}', fr: 'Depuis {{branch}}' }, { branch: data?.defaultBranch ?? '' })}
            </option>
            {data?.branches.map((branch) => (
              <option key={branch.name} value={branch.name}>
                {branch.name}
              </option>
            ))}
          </select>
          <button type="submit" className={styles.primary}>
            {t({ en: 'Create', fr: 'Créer' })}
          </button>
        </form>
        <input
          className={styles.input}
          data-testid="branch-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t({ en: 'Search branches…', fr: 'Rechercher des branches…' })}
        />
        <ul className={styles.list}>
          {branches?.length === 0 && (
            <li className={styles.muted}>{t({ en: 'No branches match', fr: 'Aucune branche ne correspond' })}</li>
          )}
          {branches?.map((branch) => (
            <li key={branch.name}>
              <span className={styles.grow}>{branch.name}</span>
              {branch.name === currentBranch ? (
                <span className={styles.muted}>{t({ en: 'current', fr: 'actuelle' })}</span>
              ) : (
                <button type="button" onClick={() => void run('checkout', { branch: branch.name })}>
                  {t({ en: 'Checkout', fr: 'Basculer' })}
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3 className={styles.eyebrow}>{t({ en: 'Workspaces', fr: 'Espaces de travail' })}</h3>
        <form
          className={styles.row}
          onSubmit={(event) => {
            event.preventDefault()
            if (workspaceName.trim())
              void run('switch-workspace', { target: workspaceName.trim() }).then(() => setWorkspaceName(''))
          }}
        >
          <input
            className={styles.input}
            value={workspaceName}
            onChange={(event) => setWorkspaceName(event.target.value)}
            placeholder={t({ en: 'Workspace name', fr: 'Nom de l’espace' })}
          />
          <button type="submit" className={styles.primary}>
            {t({ en: 'Open', fr: 'Ouvrir' })}
          </button>
        </form>
        <ul className={styles.list}>
          <li>
            <span className={styles.grow}>{t({ en: 'Original', fr: 'Original' })}</span>
            {workspace ? (
              <button type="button" onClick={() => void run('switch-workspace', { target: 'original' })}>
                {t({ en: 'Switch', fr: 'Basculer' })}
              </button>
            ) : (
              <span className={styles.muted}>{t({ en: 'current', fr: 'actuel' })}</span>
            )}
          </li>
          {workspaceList.map((item) => (
            <li key={item.name}>
              <span className={styles.grow}>{item.name}</span>
              <button type="button" onClick={() => void run('switch-workspace', { target: item.name })}>
                {t({ en: 'Switch', fr: 'Basculer' })}
              </button>
              <DeleteWorkspace onDelete={(force) => deleteWorkspace(item.name, force)} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

export function GitPanel() {
  const pluginContext = usePluginContext()
  const branch = useApp((state) => state.git?.branch)
  const context = useMemo(() => ({ ...pluginContext, branch }), [pluginContext, branch])
  return (
    <PluginZone id="session.sidebar.git" context={context}>
      <GitPanelBody />
    </PluginZone>
  )
}
