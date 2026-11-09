import { useState } from 'react'
import { getJson, sendJson } from '../api'
import { reloadOpenSession } from '../controller'
import { useLoad } from '../hooks'
import { t } from '../i18n'
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

export function GitPanel() {
  const sessionId = useApp((state) => state.session?.id)
  const projectId = useApp((state) => state.session?.projectId)
  const workspace = useApp((state) => state.session?.workspace)
  const currentBranch = useApp((state) => state.git?.branch)
  const [name, setName] = useState('')
  const [workspaceName, setWorkspaceName] = useState('')
  const [error, setError] = useState<string | null>(null)
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

  return (
    <div className={styles.stack}>
      {error && <p className={styles.error}>{error}</p>}
      <section>
        <h3 className={styles.eyebrow}>{t({ en: 'Branches', fr: 'Branches' })}</h3>
        <form
          className={styles.row}
          onSubmit={(event) => {
            event.preventDefault()
            if (name.trim()) void run('checkout-new', { name: name.trim() }).then(() => setName(''))
          }}
        >
          <input
            className={styles.input}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t({ en: 'New branch', fr: 'Nouvelle branche' })}
          />
          <button type="submit" className={styles.primary}>
            {t({ en: 'Create', fr: 'Créer' })}
          </button>
        </form>
        <ul className={styles.list}>
          {data?.branches.map((branch) => (
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
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
