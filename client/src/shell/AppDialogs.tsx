import { useEffect, useRef, useState, type FormEvent } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { openProject } from '../actions'
import { authFetch, getJson, sendJson } from '../api'
import { Markdown } from '../feed/MessageItem'
import { t } from '../i18n'
import { changelogSince, markUpdateApplied } from '../notify/startup'
import panelStyles from '../panels/Panels.module.css'
import { useApp, type AppDialog } from '../store/app'
import styles from './AgentDialogs.module.css'

type UpdateState = 'ready' | 'updating' | 'complete' | 'failed' | 'restarting' | 'restartFailed'

const POLL_INTERVAL_MS = 1000
const POLL_TIMEOUT_MS = 30_000
const CHANGELOG_SETTING = 'display.showChangelogOnUpdate'

const close = () => useApp.setState({ appDialog: null })

function UpdateDialog() {
  const update = useApp((state) => state.update)
  const [state, setState] = useState<UpdateState>('ready')
  const [message, setMessage] = useState<string | null>(null)
  const [service, setService] = useState(false)
  const [restartAvailable, setRestartAvailable] = useState(false)
  const [installed, setInstalled] = useState<string | null>(null)
  const autoRestart = useRef(false)
  const [autoRestartShown, setAutoRestartShown] = useState(false)
  const alive = useRef(true)
  const busy = state === 'updating' || state === 'restarting'

  useEffect(() => {
    alive.current = true
    void fetch('/api/auto-update/check')
      .then((response) => response.json() as Promise<{ isService?: boolean }>)
      .then((data) => {
        if (alive.current) setService(Boolean(data.isService))
      })
      .catch(() => {})
    return () => {
      alive.current = false
    }
  }, [])

  const restart = async (version: string) => {
    setState('restarting')
    setMessage(null)
    // The server may go down before it can answer
    await authFetch('/api/auto-update/restart', { method: 'POST' }).catch(() => null)
    const deadline = Date.now() + POLL_TIMEOUT_MS
    const tick = async () => {
      if (!alive.current) return
      if (Date.now() >= deadline) {
        setMessage(
          t({
            en: 'OpenFox could not be reached within 30 seconds after restart. Please restart it manually.',
            fr: 'OpenFox est resté injoignable pendant 30 secondes après le redémarrage. Veuillez le redémarrer manuellement.',
          }),
        )
        setState('restartFailed')
        return
      }
      const data = await fetch('/api/auto-update/check?force=true')
        .then((response) => (response.ok ? (response.json() as Promise<{ current: string }>) : null))
        .catch(() => null)
      if (data?.current === version) {
        markUpdateApplied(version, update.current)
        location.reload()
        return
      }
      setTimeout(() => void tick(), POLL_INTERVAL_MS)
    }
    setTimeout(() => void tick(), POLL_INTERVAL_MS)
  }

  const run = async () => {
    setState('updating')
    setMessage(null)
    try {
      const response = await authFetch('/api/auto-update', { method: 'POST' })
      const data = (await response.json()) as { success: boolean; version?: string; error?: string; isService: boolean }
      if (!data.success) {
        setMessage(data.error ?? t({ en: 'Update failed', fr: 'Échec de la mise à jour' }))
        setState('failed')
        return
      }
      const version = data.version ?? 'unknown'
      setInstalled(version)
      setRestartAvailable(Boolean(data.isService))
      // Read now: the box can be ticked while the download runs
      if (autoRestart.current && data.isService) void restart(version)
      else setState('complete')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t({ en: 'Update failed', fr: 'Échec de la mise à jour' }))
      setState('failed')
    }
  }

  const title = {
    ready: { en: 'New OpenFox version available', fr: 'Nouvelle version d’OpenFox disponible' },
    updating: { en: 'Updating…', fr: 'Mise à jour…' },
    complete: { en: 'Update complete', fr: 'Mise à jour terminée' },
    failed: { en: 'Update failed', fr: 'Échec de la mise à jour' },
    restarting: { en: 'Restarting…', fr: 'Redémarrage…' },
    restartFailed: { en: 'Restart not confirmed', fr: 'Redémarrage non confirmé' },
  }[state]

  return (
    <Dialog.Root open onOpenChange={(open) => !open && !busy && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className={panelStyles.overlay} />
        <Dialog.Content
          className={`${panelStyles.dialog} ${styles.narrow}`}
          data-testid="update-dialog"
          aria-describedby={undefined}
        >
          <div className={panelStyles.header}>
            <Dialog.Title className={panelStyles.title}>{t(title)}</Dialog.Title>
            {!busy && (
              <Dialog.Close className={panelStyles.close} aria-label={t({ en: 'Close', fr: 'Fermer' })}>
                <X size={16} />
              </Dialog.Close>
            )}
          </div>
          <div className={panelStyles.body}>
            <div className={panelStyles.stack}>
              <div className={styles.versions}>
                <span>{t({ en: 'Current version', fr: 'Version actuelle' })}</span>
                <code>{update.current}</code>
                <span>{t({ en: 'Latest version', fr: 'Dernière version' })}</span>
                <code>{update.latest}</code>
              </div>
              {busy && <div className={styles.indeterminate} />}
              {state === 'complete' && (
                <p className={panelStyles.muted}>
                  {t(
                    {
                      en: 'OpenFox has been updated to v{{version}}.',
                      fr: 'OpenFox a été mis à jour vers la v{{version}}.',
                    },
                    { version: installed ?? update.latest ?? '' },
                  )}{' '}
                  {restartAvailable
                    ? t({ en: 'Restart it to apply the update.', fr: 'Redémarrez-le pour appliquer la mise à jour.' })
                    : t({
                        en: 'Please restart OpenFox to use the new version.',
                        fr: 'Veuillez redémarrer OpenFox pour utiliser la nouvelle version.',
                      })}
                </p>
              )}
              {(state === 'failed' || state === 'restartFailed') && (
                <>
                  <p className={panelStyles.error}>{message}</p>
                  <code className={styles.fallback}>
                    {state === 'failed' ? 'openfox update' : 'openfox service restart'}
                  </code>
                  <p className={panelStyles.muted}>
                    {t({
                      en: 'Run this command in your terminal to finish.',
                      fr: 'Exécutez cette commande dans votre terminal pour terminer.',
                    })}
                  </p>
                </>
              )}
              {(state === 'ready' || state === 'updating') && service && (
                <label className={panelStyles.check}>
                  <input
                    type="checkbox"
                    checked={autoRestartShown}
                    onChange={(event) => {
                      autoRestart.current = event.target.checked
                      setAutoRestartShown(event.target.checked)
                    }}
                  />
                  {t({
                    en: 'Auto-restart once the update is done',
                    fr: 'Redémarrer automatiquement une fois la mise à jour terminée',
                  })}
                </label>
              )}
              <div className={panelStyles.row}>
                <span className={panelStyles.grow} />
                {state === 'ready' && (
                  <button
                    type="button"
                    className={panelStyles.primary}
                    data-testid="update-run"
                    onClick={() => void run()}
                  >
                    {t({ en: 'Update OpenFox', fr: 'Mettre à jour OpenFox' })}
                  </button>
                )}
                {state === 'complete' && restartAvailable && (
                  <button
                    type="button"
                    className={panelStyles.primary}
                    data-testid="update-restart"
                    onClick={() => void restart(installed ?? update.latest ?? '')}
                  >
                    {t({ en: 'Restart now', fr: 'Redémarrer maintenant' })}
                  </button>
                )}
                {(state === 'complete' || state === 'failed' || state === 'restartFailed') && (
                  <button type="button" onClick={close}>
                    {state === 'complete' && restartAvailable
                      ? t({ en: 'Later', fr: 'Plus tard' })
                      : t({ en: 'Close', fr: 'Fermer' })}
                  </button>
                )}
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function ChangelogDialog() {
  const [content, setContent] = useState<string | null>(null)
  const [showOnUpdate, setShowOnUpdate] = useState(true)

  useEffect(() => {
    const since = changelogSince()
    void getJson<{ content?: string }>(`/api/changelog${since ? `?since=${encodeURIComponent(since)}` : ''}`)
      .then((data) => setContent(data.content ?? ''))
      .catch(() => setContent(t({ en: 'Failed to load the changelog.', fr: 'Échec du chargement du journal.' })))
    void getJson<Record<string, string>>(`/api/settings?keys=${CHANGELOG_SETTING}`).then((data) =>
      setShowOnUpdate(data[CHANGELOG_SETTING] !== 'false'),
    )
  }, [])

  return (
    <Dialog.Root open onOpenChange={(open) => !open && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className={panelStyles.overlay} />
        <Dialog.Content className={panelStyles.dialog} data-testid="changelog-dialog" aria-describedby={undefined}>
          <div className={panelStyles.header}>
            <Dialog.Title className={panelStyles.title}>
              {t({ en: 'What’s new in OpenFox', fr: 'Nouveautés d’OpenFox' })}
            </Dialog.Title>
            <Dialog.Close className={panelStyles.close} aria-label={t({ en: 'Close', fr: 'Fermer' })}>
              <X size={16} />
            </Dialog.Close>
          </div>
          <div className={panelStyles.body}>
            {content !== null && <Markdown text={content} streaming={false} />}
            <label className={panelStyles.check}>
              <input
                type="checkbox"
                checked={showOnUpdate}
                onChange={(event) => {
                  setShowOnUpdate(event.target.checked)
                  void sendJson(`/api/settings/${CHANGELOG_SETTING}`, 'PUT', { value: String(event.target.checked) })
                }}
              />
              {t({
                en: 'Show the changelog on future updates',
                fr: 'Afficher le journal lors des prochaines mises à jour',
              })}
            </label>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/** Letters, digits, `.`, `_` and `-`, as a folder name: never `.` or `..`. */
export const isValidProjectName = (name: string): boolean => /^[\w.-]+$/.test(name) && !/^\.+$/.test(name)

function NewProjectDialog() {
  const root = useApp((state) => state.projectsRoot)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const trimmed = name.trim()
  const path = root && trimmed ? `${root.replace(/\/$/, '')}/${trimmed}` : null

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!path) return
    if (!isValidProjectName(trimmed)) {
      setError(
        t({
          en: 'Use only letters, numbers, hyphens, underscores and dots.',
          fr: 'Utilisez uniquement des lettres, chiffres, tirets, tirets bas et points.',
        }),
      )
      return
    }
    setBusy(true)
    void openProject(trimmed, path).then((failure) => {
      if (failure === null) {
        close()
        return
      }
      setError(failure)
      setBusy(false)
    })
  }

  return (
    <Dialog.Root open onOpenChange={(open) => !open && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className={panelStyles.overlay} />
        <Dialog.Content className={panelStyles.dialog} data-testid="new-project-dialog" aria-describedby={undefined}>
          <div className={panelStyles.header}>
            <Dialog.Title className={panelStyles.title}>
              {t({ en: 'Create a new project', fr: 'Créer un nouveau projet' })}
            </Dialog.Title>
            <Dialog.Close className={panelStyles.close} aria-label={t({ en: 'Close', fr: 'Fermer' })}>
              <X size={16} />
            </Dialog.Close>
          </div>
          <form className={panelStyles.body} onSubmit={submit}>
            <input
              className={panelStyles.input}
              data-testid="new-project-name"
              autoFocus
              value={name}
              disabled={busy}
              onChange={(event) => {
                setName(event.target.value)
                setError(null)
              }}
              placeholder={t({ en: 'my-project', fr: 'mon-projet' })}
            />
            {path && <p className={panelStyles.muted}>{path}</p>}
            {error && <p className={panelStyles.error}>{error}</p>}
            <div className={panelStyles.row}>
              <span className={panelStyles.grow} />
              <button type="submit" className={panelStyles.primary} disabled={busy || !path}>
                {t({ en: 'Create', fr: 'Créer' })}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export default function AppDialogs({ dialog }: { dialog: AppDialog }) {
  if (dialog === 'new-project') return <NewProjectDialog />
  return dialog === 'update' ? <UpdateDialog /> : <ChangelogDialog />
}
