import { useState } from 'react'
import { ArrowRight, ListTodo, Paperclip } from 'lucide-react'
import type { ProjectTask } from '@shared/types.js'
import { openPanel } from '../controller'
import { t } from '../i18n'
import { nextUpTasks } from '../panels/tasks/board'
import { moveTask, useBoard, useBoards } from '../panels/tasks/boardStore'
import { useRoute } from '../router'
import styles from './UpNext.module.css'

/** Launchpad of an empty feed: starts an unclaimed task in the current session. */
export default function UpNext() {
  const { projectId, sessionId } = useRoute()
  const board = useBoard(projectId)
  const error = useBoards((state) => state.error)
  const [queued, setQueued] = useState<string | null>(null)
  const tasks = board ? nextUpTasks(board.tasks) : []
  if (!projectId || !sessionId || tasks.length === 0) return null

  const running = board!.tasks.filter((task) => task.status === 'in_progress' && task.runState === 'running').length

  const start = async (task: ProjectTask) => {
    setQueued(null)
    const result = await moveTask(projectId, task, 'in_progress', sessionId)
    if (result?.task.runState === 'queued') {
      setQueued(task.prompt.split('\n')[0]?.slice(0, 60) || t({ en: 'This task', fr: 'Cette tâche' }))
    }
  }

  return (
    <div className={styles.panel} data-testid="up-next">
      <div className={styles.header}>
        <ListTodo size={14} />
        <span className={styles.title}>{t({ en: 'Up next', fr: 'À suivre' })}</span>
        {running > 0 && (
          <span className={styles.running}>
            {t({ en: '{{count}} running', fr: '{{count}} en cours' }, { count: running })}
          </span>
        )}
        <span className={styles.spacer} />
        <button type="button" className={styles.button} onClick={() => openPanel('tasks')}>
          {t({ en: 'Manage tasks', fr: 'Gérer les tâches' })}
        </button>
      </div>
      {queued && (
        <p className={styles.notice}>
          {t(
            {
              en: '“{{label}}” is queued. It will start automatically when a slot frees.',
              fr: '« {{label}} » est en file. Elle démarrera automatiquement dès qu’un emplacement se libère.',
            },
            { label: queued },
          )}
        </p>
      )}
      <ul className={styles.list}>
        {tasks.map((task, index) => (
          <li key={task.id} className={styles.row}>
            <div className={styles.text}>
              <p className={styles.prompt}>{task.prompt}</p>
              <div className={styles.meta}>
                {task.attachments.length > 0 && (
                  <span>
                    <Paperclip size={11} /> {task.attachments.length}
                  </span>
                )}
                {task.model && <span>{task.model}</span>}
              </div>
            </div>
            <button
              type="button"
              className={styles.button}
              data-primary={index === 0 || undefined}
              data-testid="up-next-start"
              onClick={() => void start(task)}
            >
              {t({ en: 'Start', fr: 'Démarrer' })} <ArrowRight size={12} />
            </button>
          </li>
        ))}
      </ul>
      {error && <p className={styles.error}>{error}</p>}
    </div>
  )
}
