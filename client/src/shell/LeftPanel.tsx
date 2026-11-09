import { Plus } from 'lucide-react'
import { createSession } from '../controller'
import { t } from '../i18n'
import { Link, useRoute } from '../router'
import { useApp } from '../store/app'
import { ProjectTree } from './ProjectTree'
import styles from './Shell.module.css'

function Projects() {
  const projects = useApp((state) => state.projects)
  return (
    <section className={styles.section}>
      <h2 className={styles.eyebrow}>{t({ en: 'Projects', fr: 'Projets' })}</h2>
      {projects.map((project) => (
        <Link key={project.id} href={`/p/${project.id}`} className={styles.row}>
          <span className={styles.truncate}>{project.name}</span>
          <span className={styles.rowMeta}>{project.workdir}</span>
        </Link>
      ))}
    </section>
  )
}

function Sessions({ projectId, sessionId }: { projectId: string; sessionId: string | null }) {
  const sessions = useApp((state) => state.sessions)
  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.eyebrow}>{t({ en: 'Sessions', fr: 'Sessions' })}</h2>
        <button type="button" className={styles.textButton} onClick={() => void createSession(projectId)}>
          <Plus size={12} />
          {t({ en: 'New', fr: 'Nouvelle' })}
        </button>
      </div>
      {sessions.map((session) => (
        <Link
          key={session.id}
          href={`/p/${projectId}/s/${session.id}`}
          className={styles.row}
          data-active={session.id === sessionId || undefined}
        >
          <span className={styles.truncate}>{session.title ?? session.id.slice(0, 8)}</span>
          {session.isRunning && <span className={styles.runBadge}>{t({ en: 'Run', fr: 'En cours' })}</span>}
        </Link>
      ))}
    </section>
  )
}

export function LeftPanel() {
  const { projectId, sessionId } = useRoute()
  return (
    <aside className={styles.left} data-pane="project">
      {sessionId && <ProjectTree />}
      {projectId ? <Sessions projectId={projectId} sessionId={sessionId} /> : <Projects />}
    </aside>
  )
}
