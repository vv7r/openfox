import { useEffect, useState, type FormEvent } from 'react'
import { openProject } from '../actions'
import { getJson } from '../api'
import { createSession } from '../controller'
import { t } from '../i18n'
import { Link, useRoute } from '../router'
import { useApp } from '../store/app'
import styles from './Shell.module.css'

interface Directory {
  current: string
  parent: string | null
  directories: Array<{ name: string; path: string }>
}

function OpenProject() {
  const [path, setPath] = useState('')
  const [browser, setBrowser] = useState<Directory | null>(null)
  const [error, setError] = useState<string | null>(null)

  const browse = (target: string) => {
    void getJson<Directory>(`/api/directories${target ? `?path=${encodeURIComponent(target)}` : ''}`).then(
      (directory) => {
        setBrowser(directory)
        setPath(directory.current)
      },
    )
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const workdir = path.trim()
    if (!workdir) return
    void openProject(workdir.split('/').filter(Boolean).pop() ?? workdir, workdir).then(setError)
  }

  return (
    <>
      <form className={styles.homeForm} onSubmit={submit}>
        <input
          className={styles.field}
          value={path}
          onChange={(event) => setPath(event.target.value)}
          onFocus={() => browser === null && browse('')}
          placeholder={t({ en: 'Project folder', fr: 'Dossier du projet' })}
        />
        <button type="submit" className={styles.primary}>
          {t({ en: 'Open', fr: 'Ouvrir' })}
        </button>
      </form>
      {error && <p className={styles.error}>{error}</p>}
      {browser && (
        <div className={styles.browser}>
          {browser.parent && (
            <button type="button" onClick={() => browse(browser.parent!)}>
              {t({ en: 'Parent folder', fr: 'Dossier parent' })}
            </button>
          )}
          {browser.directories.map((directory) => (
            <button key={directory.path} type="button" onClick={() => browse(directory.path)}>
              {directory.name}
            </button>
          ))}
        </div>
      )}
    </>
  )
}

interface RecentSession {
  id: string
  projectId: string
  title?: string
}

function Recent() {
  const [sessions, setSessions] = useState<RecentSession[]>([])
  useEffect(() => {
    let active = true
    void getJson<{ sessions: RecentSession[] }>('/api/sessions/home').then((data) => {
      if (active) setSessions(data.sessions.slice(0, 20))
    })
    return () => {
      active = false
    }
  }, [])
  if (sessions.length === 0) return null
  return (
    <section className={styles.section}>
      <h2 className={styles.eyebrow}>{t({ en: 'Recent sessions', fr: 'Sessions récentes' })}</h2>
      {sessions.map((session) => (
        <Link key={session.id} href={`/p/${session.projectId}/s/${session.id}`} className={styles.row}>
          <span className={styles.truncate}>{session.title ?? session.id.slice(0, 8)}</span>
        </Link>
      ))}
    </section>
  )
}

export function Home() {
  const { projectId } = useRoute()
  const project = useApp((state) => state.projects.find((p) => p.id === projectId))
  if (projectId) {
    return (
      <div className={styles.home}>
        <h1>{project?.name}</h1>
        <p className={styles.empty}>{t({ en: 'No session selected', fr: 'Aucune session sélectionnée' })}</p>
        <button type="button" className={styles.primary} onClick={() => void createSession(projectId)}>
          {t({ en: 'Create a new session', fr: 'Créer une nouvelle session' })}
        </button>
      </div>
    )
  }
  return (
    <div className={styles.home}>
      <h1>{t({ en: 'OpenFox', fr: 'OpenFox' })}</h1>
      <OpenProject />
      <Recent />
    </div>
  )
}
