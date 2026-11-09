import { useCallback, useState, type FormEvent } from 'react'
import { Trash2 } from 'lucide-react'
import type { ProjectTask } from '@shared/types.js'
import { authFetch, getJson, sendJson } from '../api'
import { useLoad, useServerEvents } from '../hooks'
import { t } from '../i18n'
import { navigate, useRoute } from '../router'
import { openPanel } from '../controller'
import styles from './Panels.module.css'

type Target = 'todo' | 'in_progress' | 'done'

const COLUMNS: Array<{ id: string; title: { en: string; fr: string }; next: Target | null }> = [
  { id: 'todo', title: { en: 'To do', fr: 'À faire' }, next: 'in_progress' },
  { id: 'in_progress', title: { en: 'In progress', fr: 'En cours' }, next: 'done' },
  { id: 'done', title: { en: 'Done', fr: 'Terminé' }, next: null },
]

export function TasksPanel() {
  const { projectId } = useRoute()
  const base = `/api/projects/${projectId}/tasks`
  const { data, reload } = useLoad(() => getJson<{ tasks: ProjectTask[] }>(base), base)
  const [prompt, setPrompt] = useState('')
  const [error, setError] = useState<string | null>(null)
  useServerEvents(['tasks.update'], useCallback(reload, [reload]))

  const add = async (event: FormEvent) => {
    event.preventDefault()
    if (!prompt.trim()) return
    await sendJson(base, 'POST', { prompt: prompt.trim() })
    setPrompt('')
    reload()
  }

  const move = async (task: ProjectTask, to: Target) => {
    setError(null)
    const response = await sendJson(`${base}/${task.id}/move`, 'POST', { to, expectedVersion: task.version })
    if (!response.ok) setError(((await response.json().catch(() => ({}))) as { error?: string }).error ?? null)
    reload()
  }

  const remove = async (task: ProjectTask) => {
    await authFetch(`${base}/${task.id}`, { method: 'DELETE' })
    reload()
  }

  return (
    <div className={styles.stack}>
      <form className={styles.row} onSubmit={(event) => void add(event)}>
        <input
          className={styles.input}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder={t({ en: 'New task', fr: 'Nouvelle tâche' })}
        />
        <button type="submit" className={styles.primary}>
          {t({ en: 'Add', fr: 'Ajouter' })}
        </button>
      </form>
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.board}>
        {COLUMNS.map((column) => (
          <section key={column.id}>
            <h3 className={styles.eyebrow}>{t(column.title)}</h3>
            {data?.tasks
              .filter((task) => task.status === column.id)
              .map((task) => (
                <article key={task.id} className={styles.card}>
                  <p>{task.prompt}</p>
                  <div className={styles.row}>
                    {column.next && (
                      <button type="button" onClick={() => void move(task, column.next!)}>
                        {t({ en: 'Advance', fr: 'Avancer' })}
                      </button>
                    )}
                    {task.activeSessionId && (
                      <button
                        type="button"
                        onClick={() => {
                          openPanel(null)
                          navigate(`/p/${projectId}/s/${task.activeSessionId}`)
                        }}
                      >
                        {t({ en: 'Session', fr: 'Session' })}
                      </button>
                    )}
                    <span className={styles.grow} />
                    <button
                      type="button"
                      aria-label={t({ en: 'Delete', fr: 'Supprimer' })}
                      onClick={() => void remove(task)}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </article>
              ))}
          </section>
        ))}
      </div>
    </div>
  )
}
