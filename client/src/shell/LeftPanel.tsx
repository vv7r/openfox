import { lazy, Suspense, useMemo, useRef, useState } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Ellipsis, Plus, Star, Upload } from 'lucide-react'
import type { SessionSummary } from '@shared/types.js'
import {
  deleteAllSessions,
  deleteSession,
  exportSession,
  importSession,
  openProjectFolder,
  renameSession,
  toggleFavorite,
} from '../actions'
import { createSession, loadMoreSessions, revealOpenSession } from '../controller'
import { t } from '../i18n'
import { PluginBadges, PluginZone, usePluginContext } from '../plugins/Slots'
import { Link, useRoute } from '../router'
import { useApp } from '../store/app'
import styles from './Shell.module.css'

// Only the home page lists projects, so the entry bundle does not carry them
const Projects = lazy(() => import('./LeftProjects'))

function SessionRow({ session, projectId, active }: { session: SessionSummary; projectId: string; active: boolean }) {
  const [renaming, setRenaming] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const title = session.title || session.id.slice(0, 8)
  const unread = useApp((state) => state.unreadSessions.includes(session.id))
  const pending = useApp((state) => (state.confirmationsElsewhere[session.id]?.length ?? 0) > 0)
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
      <Link
        href={`/p/${projectId}/s/${session.id}`}
        className={styles.row}
        data-active={active || undefined}
        // The route does not change for the open session, so nothing else would reveal it
        onClick={active ? revealOpenSession : undefined}
      >
        {session.isFavorite && <Star size={12} className={styles.favorite} />}
        {pending ? (
          <span
            className={styles.pendingDot}
            data-testid="session-pending"
            title={t({ en: 'Awaiting confirmation', fr: 'En attente de confirmation' })}
          />
        ) : (
          unread && (
            <span
              className={styles.unreadDot}
              data-testid="session-unread"
              title={t({ en: 'Unread activity', fr: 'Activité non lue' })}
            />
          )
        )}
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

function askDeleteProject(projectId: string): void {
  const project = useApp.getState().projects.find((candidate) => candidate.id === projectId)
  if (project) {
    useApp.setState({
      appDialog: { kind: 'delete-project', projectId, name: project.name, workdir: project.workdir },
    })
  }
}

function ProjectMenu({ projectId, onDeleteAll }: { projectId: string; onDeleteAll: () => void }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className={styles.textButton}
        data-testid="project-menu"
        aria-label={t({ en: 'Project options', fr: 'Options du projet' })}
      >
        <Ellipsis size={12} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={styles.menu} align="end" sideOffset={4}>
          <DropdownMenu.Item
            className={styles.menuItem}
            data-testid="project-settings"
            onSelect={() => useApp.setState({ appDialog: { kind: 'project-settings', projectId } })}
          >
            {t({ en: 'Project settings', fr: 'Paramètres du projet' })}
          </DropdownMenu.Item>
          <DropdownMenu.Item className={styles.menuItem} onSelect={() => void openProjectFolder(projectId)}>
            {t({ en: 'Open folder', fr: 'Ouvrir le dossier' })}
          </DropdownMenu.Item>
          <DropdownMenu.Item className={styles.menuItem} data-danger onSelect={onDeleteAll}>
            {t({ en: 'Delete all sessions', fr: 'Supprimer toutes les sessions' })}
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className={styles.menuItem}
            data-danger
            data-testid="delete-project"
            onSelect={() => askDeleteProject(projectId)}
          >
            {t({ en: 'Delete project', fr: 'Supprimer le projet' })}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

function Sessions({ projectId, sessionId }: { projectId: string; sessionId: string | null }) {
  const sessions = useApp((state) => state.sessions)
  const hasMore = useApp((state) => state.sessionsHasMore)
  const [query, setQuery] = useState('')
  const [importFailed, setImportFailed] = useState(false)
  const [confirmingAll, setConfirmingAll] = useState(false)
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
          <ProjectMenu projectId={projectId} onDeleteAll={() => setConfirmingAll(true)} />
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
      {confirmingAll && (
        <div className={styles.row}>
          <span className={styles.truncate}>
            {t({ en: 'Delete all sessions in this project?', fr: 'Supprimer toutes les sessions du projet ?' })}
          </span>
          <button
            type="button"
            className={styles.textButton}
            data-testid="delete-all-confirm"
            onClick={() => {
              setConfirmingAll(false)
              void deleteAllSessions(projectId)
            }}
          >
            {t({ en: 'Yes', fr: 'Oui' })}
          </button>
          <button type="button" className={styles.textButton} onClick={() => setConfirmingAll(false)}>
            {t({ en: 'No', fr: 'Non' })}
          </button>
        </div>
      )}
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
          {projectId ? (
            <Sessions projectId={projectId} sessionId={sessionId} />
          ) : (
            <Suspense fallback={null}>
              <Projects />
            </Suspense>
          )}
        </PluginZone>
        <PluginZone id="sidebar.footer" context={context} />
      </PluginZone>
    </aside>
  )
}
