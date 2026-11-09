import { useEffect, useState, type FormEvent } from 'react'
import { openProject } from '../actions'
import { getJson } from '../api'
import { t } from '../i18n'
import { Link, useRoute } from '../router'
import { useApp } from '../store/app'
import { DirectoryList, useDirectoryBrowser } from './DirectoryBrowser'
import styles from './Shell.module.css'

function OpenProject() {
  const [path, setPath] = useState('')
  const { directory, browse } = useDirectoryBrowser(setPath)
  const [error, setError] = useState<string | null>(null)

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
          onFocus={() => directory === null && browse('')}
          placeholder={t({ en: 'Project folder', fr: 'Dossier du projet' })}
        />
        <button type="submit" className={styles.primary}>
          {t({ en: 'Open', fr: 'Ouvrir' })}
        </button>
      </form>
      {error && <p className={styles.error}>{error}</p>}
      <DirectoryList directory={directory} browse={browse} />
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
