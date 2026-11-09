import { useMemo, useRef, useState } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Ellipsis, Plus, Star, Upload } from 'lucide-react'
import type { SessionSummary } from '@shared/types.js'
import { deleteSession, exportSession, importSession, renameSession, toggleFavorite } from '../actions'
import { createSession, loadMoreSessions } from '../controller'
import { t } from '../i18n'
import { PluginBadges, PluginZone, usePluginContext } from '../plugins/Slots'
import { Link, useRoute } from '../router'
import { useApp } from '../store/app'
import styles from './Shell.module.css'

function Projects() {
  const projects = useApp((state) => state.projects)
  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.eyebrow}>{t({ en: 'Projects', fr: 'Projets' })}</h2>
        <button
          type="button"
          className={styles.textButton}
          data-testid="new-project"
          onClick={() => useApp.setState({ appDialog: 'new-project' })}
        >
          <Plus size={12} />
          {t({ en: 'New', fr: 'Nouveau' })}
        </button>
      </div>
      {projects.map((project) => (
        <Link key={project.id} href={`/p/${project.id}`} className={styles.row} title={project.workdir}>
          <span className={styles.projectName}>{project.name}</span>
        </Link>
      ))}
    </section>
  )
}

function SessionRow({ session, projectId, active }: { session: SessionSummary; projectId: string; active: boolean }) {
  const [renaming, setRenaming] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const title = session.title ?? session.id.slice(0, 8)
  const badgeContext = useMemo(
    () => ({ sessionId: session.id, projectId, workdir: session.workspace ?? session.workdir }),
    [session.id, projectId, session.workspace, session.workdir],
  )

  if (renaming !== null) {
    const commit = () => {
      if (renaming.trim()) void renameSession(session.id, renaming.trim())
      setRenaming(null)
    }
    return (
      <input
        className={styles.rowInput}
        autoFocus
        value={renaming}
        onChange={(event) => setRenaming(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit()
          if (event.key === 'Escape') setRenaming(null)
        }}
      />
    )
  }

  if (confirming) {
    return (
      <div className={styles.row}>
        <span className={styles.truncate}>{t({ en: 'Delete this session?', fr: 'Supprimer cette session ?' })}</span>
        <button type="button" className={styles.textButton} onClick={() => void deleteSession(session.id, projectId)}>
          {t({ en: 'Yes', fr: 'Oui' })}
        </button>
        <button type="button" className={styles.textButton} onClick={() => setConfirming(false)}>
          {t({ en: 'No', fr: 'Non' })}
        </button>
      </div>
    )
  }

  return (
    <div className={styles.sessionRow}>
      <Link href={`/p/${projectId}/s/${session.id}`} className={styles.row} data-active={active || undefined}>
        {session.isFavorite && <Star size={12} className={styles.favorite} />}
        <span className={styles.truncate}>{title}</span>
        <PluginBadges slot="session.row.badges" context={badgeContext} />
        {session.isRunning && <span className={styles.runBadge}>{t({ en: 'Run', fr: 'En cours' })}</span>}
      </Link>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger className={styles.rowMenu} aria-label={t({ en: 'Options', fr: 'Options' })}>
          <Ellipsis size={14} />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className={styles.menu} align="end" sideOffset={4}>
            <DropdownMenu.Item
              className={styles.menuItem}
              onSelect={() => void toggleFavorite(session.id, !session.isFavorite)}
            >
              {session.isFavorite
                ? t({ en: 'Remove from favorites', fr: 'Retirer des favoris' })
                : t({ en: 'Add to favorites', fr: 'Ajouter aux favoris' })}
            </DropdownMenu.Item>
            <DropdownMenu.Item className={styles.menuItem} onSelect={() => setRenaming(title)}>
              {t({ en: 'Rename', fr: 'Renommer' })}
            </DropdownMenu.Item>
            {!session.isRunning && (
              <DropdownMenu.Item className={styles.menuItem} onSelect={() => void exportSession(session.id, title)}>
                {t({ en: 'Export', fr: 'Exporter' })}
              </DropdownMenu.Item>
            )}
            <DropdownMenu.Item className={styles.menuItem} data-danger onSelect={() => setConfirming(true)}>
              {t({ en: 'Delete', fr: 'Supprimer' })}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  )
}

function Sessions({ projectId, sessionId }: { projectId: string; sessionId: string | null }) {
  const sessions = useApp((state) => state.sessions)
  const hasMore = useApp((state) => state.sessionsHasMore)
  const [query, setQuery] = useState('')
  const [importFailed, setImportFailed] = useState(false)
  const picker = useRef<HTMLInputElement>(null)

  const needle = query.trim().toLowerCase()
  const filtered = sessions.filter((session) => (session.title ?? '').toLowerCase().includes(needle))
  const ordered = [...filtered.filter((s) => s.isFavorite), ...filtered.filter((s) => !s.isFavorite)]

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.eyebrow}>{t({ en: 'Sessions', fr: 'Sessions' })}</h2>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.textButton}
            aria-label={t({ en: 'Import session', fr: 'Importer une session' })}
            onClick={() => picker.current?.click()}
          >
            <Upload size={12} />
          </button>
          <button
            type="button"
            className={styles.textButton}
            data-testid="new-session"
            onClick={() => void createSession(projectId)}
          >
            <Plus size={12} />
            {t({ en: 'New', fr: 'Nouvelle' })}
          </button>
        </div>
      </div>
      <input
        ref={picker}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) void importSession(projectId, file).then((ok) => setImportFailed(!ok))
        }}
      />
      {importFailed && (
        <p className={styles.error}>{t({ en: 'Invalid session file', fr: 'Fichier de session invalide' })}</p>
      )}
      <input
        className={styles.search}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t({ en: 'Search sessions…', fr: 'Rechercher des sessions…' })}
      />
      {ordered.map((session) => (
        <SessionRow key={session.id} session={session} projectId={projectId} active={session.id === sessionId} />
      ))}
      {hasMore && !needle && (
        <button type="button" className={styles.loadMore} onClick={() => void loadMoreSessions()}>
          {t({ en: 'Load more', fr: 'Charger plus' })}
        </button>
      )}
    </section>
  )
}

export function LeftPanel() {
  const { projectId, sessionId } = useRoute()
  const context = usePluginContext()
  return (
    <aside className={styles.left} data-pane="project">
      <PluginZone id="sidebar" context={context}>
        <PluginZone id="sidebar.header" context={context} />

        <PluginZone id="sidebar.sessions_list" context={context}>
          {projectId ? <Sessions projectId={projectId} sessionId={sessionId} /> : <Projects />}
        </PluginZone>
        <PluginZone id="sidebar.footer" context={context} />
      </PluginZone>
    </aside>
  )
}
