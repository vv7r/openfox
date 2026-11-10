import { useEffect, useMemo, useState, type FormEvent } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Ellipsis, Plus, Star } from 'lucide-react'
import type { Project, ProjectTaskCounts, SessionSummary } from '@shared/types.js'
import { openProject, openProjectFolder, toggleProjectStar } from '../actions'
import { getJson } from '../api'
import { createSession } from '../controller'
import { useLoad } from '../hooks'
import { t } from '../i18n'
import { Link, useRoute } from '../router'
import { useApp } from '../store/app'
import { DirectoryList, useDirectoryBrowser } from './DirectoryBrowser'
import { searchSessions } from './homeSearch'
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

const HOME_LIMIT = 20
const SEARCH_DELAY_MS = 150

type TaskCounts = Pick<ProjectTaskCounts, 'todo' | 'queued' | 'running' | 'done'>

const TASK_CHIPS: Array<{ key: keyof TaskCounts; label: { en: string; fr: string } }> = [
  { key: 'todo', label: { en: 'To do', fr: 'À faire' } },
  { key: 'queued', label: { en: 'Queued', fr: 'En file' } },
  { key: 'running', label: { en: 'Running', fr: 'En cours' } },
  { key: 'done', label: { en: 'Done', fr: 'Terminé' } },
]

function TaskChips({ projectId }: { projectId: string }) {
  const { data } = useLoad(() => getJson<{ counts: TaskCounts }>(`/api/projects/${projectId}/tasks/count`), projectId)
  if (!data) return null
  return (
    <>
      {TASK_CHIPS.filter((chip) => data.counts[chip.key] > 0).map((chip) => (
        <span key={chip.key} className={styles.taskChip} data-state={chip.key} title={t(chip.label)}>
          {data.counts[chip.key]}
        </span>
      ))}
    </>
  )
}

function ProjectRow({ project }: { project: Project }) {
  return (
    <div className={styles.projectCard} data-testid="home-project">
      <button
        type="button"
        className={styles.textButton}
        aria-label={
          project.isStarred
            ? t({ en: 'Remove star', fr: 'Retirer l’étoile' })
            : t({ en: 'Add star', fr: 'Ajouter une étoile' })
        }
        onClick={() => void toggleProjectStar(project.id, !project.isStarred)}
      >
        <Star size={14} className={project.isStarred ? styles.favorite : undefined} />
      </button>
      <Link href={`/p/${project.id}`} className={styles.projectCardName} title={project.workdir}>
        {project.name}
      </Link>
      <TaskChips projectId={project.id} />
      <button type="button" className={styles.textButton} onClick={() => void createSession(project.id)}>
        <Plus size={12} />
        {t({ en: 'New session', fr: 'Nouvelle session' })}
      </button>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          className={styles.textButton}
          aria-label={t({ en: 'Project options', fr: 'Options du projet' })}
        >
          <Ellipsis size={14} />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className={styles.menu} align="end" sideOffset={4}>
            <DropdownMenu.Item
              className={styles.menuItem}
              onSelect={() => useApp.setState({ appDialog: { kind: 'project-settings', projectId: project.id } })}
            >
              {t({ en: 'Settings', fr: 'Paramètres' })}
            </DropdownMenu.Item>
            <DropdownMenu.Item className={styles.menuItem} onSelect={() => void openProjectFolder(project.id)}>
              {t({ en: 'Open folder', fr: 'Ouvrir le dossier' })}
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className={styles.menuItem}
              data-danger
              onSelect={() =>
                useApp.setState({
                  appDialog: {
                    kind: 'delete-project',
                    projectId: project.id,
                    name: project.name,
                    workdir: project.workdir,
                  },
                })
              }
            >
              {t({ en: 'Delete', fr: 'Supprimer' })}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  )
}

function Projects() {
  const projects = useApp((state) => state.projects)
  const sorted = [...projects.filter((p) => p.isStarred), ...projects.filter((p) => !p.isStarred)]
  return (
    <section className={styles.section}>
      <h2 className={styles.eyebrow}>{t({ en: 'Projects', fr: 'Projets' })}</h2>
      {sorted.length === 0 && (
        <p className={styles.empty}>
          {t({ en: 'No projects yet. Open a folder to start.', fr: 'Aucun projet. Ouvrez un dossier pour commencer.' })}
        </p>
      )}
      {sorted.map((project) => (
        <ProjectRow key={project.id} project={project} />
      ))}
    </section>
  )
}

function Recent() {
  const projects = useApp((state) => state.projects)
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [corpus, setCorpus] = useState<SessionSummary[] | null>(null)
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')

  useEffect(() => {
    let active = true
    void getJson<{ sessions: SessionSummary[] }>('/api/sessions/home').then((data) => {
      if (active) setSessions(data.sessions)
    })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [query])

  // The full list carries the prompts: only worth fetching once someone searches
  useEffect(() => {
    if (!debounced || corpus) return
    let active = true
    void getJson<{ sessions: SessionSummary[] }>('/api/sessions').then((data) => {
      if (active) setCorpus(data.sessions)
    })
    return () => {
      active = false
    }
  }, [debounced, corpus])

  const hits = useMemo(() => {
    if (!debounced) return sessions.slice(0, HOME_LIMIT).map((session) => ({ session, snippet: null }))
    const names = new Map(projects.map((project) => [project.id, project.name]))
    return searchSessions(corpus ?? sessions, debounced, (id) => names.get(id) ?? '')
  }, [corpus, debounced, projects, sessions])

  return (
    <section className={styles.section}>
      <h2 className={styles.eyebrow}>{t({ en: 'Recent sessions', fr: 'Sessions récentes' })}</h2>
      <input
        className={styles.search}
        data-testid="home-search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t({ en: 'Search sessions by title or keyword…', fr: 'Rechercher par titre ou mot-clé…' })}
      />
      {hits.length === 0 && debounced && (
        <p className={styles.empty}>{t({ en: 'No matching sessions', fr: 'Aucune session trouvée' })}</p>
      )}
      {hits.map(({ session, snippet }) => (
        <Link key={session.id} href={`/p/${session.projectId}/s/${session.id}`} className={styles.row}>
          <span className={styles.truncate}>{session.title ?? session.id.slice(0, 8)}</span>
          {snippet && <small className={styles.truncate}>{snippet}</small>}
        </Link>
      ))}
    </section>
  )
}

export function Home() {
  const { projectId } = useRoute()
  const project = useApp((state) => state.projects.find((p) => p.id === projectId))
  const projectsFirst = useApp((state) => state.display['display.showProjectsAboveSessions'] === 'true')
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
      {projectsFirst && <Projects />}
      <Recent />
      {!projectsFirst && <Projects />}
    </div>
  )
}
