import { useMemo, useRef, useState, type ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Minus, Pause, Play, Plus, Search } from 'lucide-react'
import type { ProjectTask, TaskStatus } from '@shared/types.js'
import { t } from '../i18n'
import { useRoute } from '../router'
import { GatesEditor } from './tasks/GatesEditor'
import { STATUS_LABELS, TaskCard, type CardActions } from './tasks/TaskCard'
import { TaskEditor } from './tasks/TaskEditor'
import { arrangeColumns, queueRank, stepSlot, type Board } from './tasks/board'
import {
  clearBoardError,
  currentSettings,
  deleteTask,
  dropTask,
  duplicateTask,
  moveTask,
  shiftTask,
  updateBoardSettings,
  useBoard,
  useBoards,
} from './tasks/boardStore'
import panelStyles from './Panels.module.css'
import styles from './tasks/Tasks.module.css'

type EditorState = { task: ProjectTask | null } | null

const STATUSES: TaskStatus[] = ['todo', 'in_progress', 'done']

function QueueFooter({ projectId, board }: { projectId: string; board: Board }) {
  const { slotLimit, queuePaused } = board.settings
  const inProgress = board.tasks.filter((task) => task.status === 'in_progress')
  const running = inProgress.filter((task) => task.runState === 'running').length
  const queued = inProgress.filter((task) => task.runState === 'queued').length

  const adjust = (delta: -1 | 1) => {
    // The store, not this render: rapid clicks must each see the previous one
    const current = currentSettings(projectId)?.slotLimit ?? slotLimit
    const next = stepSlot(current, delta)
    if (next !== current) updateBoardSettings(projectId, { slotLimit: next })
  }

  return (
    <div className={styles.queue} data-testid="task-queue">
      <div className={panelStyles.row}>
        <span className={panelStyles.grow}>{t({ en: 'Parallel slots', fr: 'Emplacements parallèles' })}</span>
        <button
          type="button"
          disabled={slotLimit <= 1}
          aria-label={t({ en: 'Decrease slot limit', fr: 'Diminuer la limite d’emplacements' })}
          onClick={() => adjust(-1)}
        >
          <Minus size={12} />
        </button>
        <strong data-testid="task-slots">{slotLimit}</strong>
        <button
          type="button"
          disabled={slotLimit >= 10}
          aria-label={t({ en: 'Increase slot limit', fr: 'Augmenter la limite d’emplacements' })}
          onClick={() => adjust(1)}
        >
          <Plus size={12} />
        </button>
      </div>
      <div className={panelStyles.row}>
        <span className={`${panelStyles.muted} ${panelStyles.grow}`}>
          {t(
            { en: '{{running}} / {{limit}} running', fr: '{{running}} / {{limit}} en cours' },
            { running, limit: slotLimit },
          )}
          {queued > 0 && ` · ${t({ en: '{{queued}} queued', fr: '{{queued}} en file' }, { queued })}`}
        </span>
        <button
          type="button"
          data-testid="task-queue-pause"
          aria-pressed={queuePaused}
          title={
            queuePaused
              ? t({
                  en: 'Resume auto-launch of queued tasks',
                  fr: 'Reprendre le lancement automatique des tâches en file',
                })
              : t({
                  en: 'Pause auto-launch of queued tasks',
                  fr: 'Suspendre le lancement automatique des tâches en file',
                })
          }
          onClick={() => updateBoardSettings(projectId, { queuePaused: !queuePaused })}
        >
          {queuePaused ? <Play size={12} /> : <Pause size={12} />}{' '}
          {queuePaused ? t({ en: 'Resume', fr: 'Reprendre' }) : t({ en: 'Pause', fr: 'Pause' })}
        </button>
      </div>
    </div>
  )
}

interface ColumnProps {
  status: TaskStatus
  tasks: ProjectTask[]
  action?: ReactNode
  footer?: ReactNode
  hint?: string
  onDrop: () => void
  children: ReactNode
}

function Column({ status, tasks, action, footer, hint, onDrop, children }: ColumnProps) {
  const [over, setOver] = useState(false)
  return (
    <section
      className={styles.column}
      data-status={status}
      data-over={over || undefined}
      data-testid={`task-column-${status}`}
      onDragOver={(event) => {
        event.preventDefault()
        setOver(true)
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false)
      }}
      onDrop={(event) => {
        event.preventDefault()
        setOver(false)
        onDrop()
      }}
      onDropCapture={() => setOver(false)}
    >
      <header className={styles.columnHeader}>
        <h3 className={panelStyles.eyebrow}>
          {t(STATUS_LABELS[status])}
          {` · ${tasks.length}`}
        </h3>
        {action}
      </header>
      {hint && <p className={panelStyles.muted}>{hint}</p>}
      <div className={styles.columnBody}>{children}</div>
      {footer}
    </section>
  )
}

function ConfirmDelete({
  task,
  onCancel,
  onConfirm,
}: {
  task: ProjectTask
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onCancel()}>
      <Dialog.Portal>
        <Dialog.Overlay className={panelStyles.overlay} />
        <Dialog.Content className={`${panelStyles.dialog} ${styles.confirm}`} aria-describedby={undefined}>
          <div className={panelStyles.header}>
            <Dialog.Title className={panelStyles.title}>
              {t({ en: 'Delete task?', fr: 'Supprimer la tâche ?' })}
            </Dialog.Title>
          </div>
          <div className={panelStyles.body}>
            <p className={panelStyles.muted}>
              {t(
                {
                  en: '“{{prompt}}” will be removed from the board. Its sessions and history stay untouched.',
                  fr: '« {{prompt}} » sera retirée du tableau. Ses sessions et son historique restent intacts.',
                },
                { prompt: task.prompt.slice(0, 60) },
              )}
            </p>
            <div className={panelStyles.row}>
              <span className={panelStyles.grow} />
              <button type="button" onClick={onCancel}>
                {t({ en: 'Cancel', fr: 'Annuler' })}
              </button>
              <button type="button" className={styles.danger} data-testid="task-delete-confirm" onClick={onConfirm}>
                {t({ en: 'Delete task', fr: 'Supprimer la tâche' })}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export function TasksPanel() {
  const { projectId } = useRoute()
  const board = useBoard(projectId)
  const error = useBoards((state) => state.error)
  const [search, setSearch] = useState('')
  const [editor, setEditor] = useState<EditorState>(null)
  const [gatesOpen, setGatesOpen] = useState(false)
  const [toDelete, setToDelete] = useState<ProjectTask | null>(null)
  const dragged = useRef<ProjectTask | null>(null)
  const columns = useMemo(() => arrangeColumns(board?.tasks ?? [], search), [board?.tasks, search])

  if (!projectId) return null
  const tasks = board?.tasks ?? []

  const drop = (status: TaskStatus, targetId?: string) => {
    const task = dragged.current
    dragged.current = null
    if (task) void dropTask(projectId, tasks, task, status, targetId)
  }

  const actions: CardActions = {
    onEdit: (task) => setEditor({ task }),
    onMove: (task, to) => void moveTask(projectId, task, to),
    onShift: (task, delta) => void shiftTask(projectId, tasks, task, delta),
    onDuplicate: (task) => void duplicateTask(projectId, task.id),
    onDelete: setToDelete,
    onDragStart: (task) => {
      dragged.current = task
    },
    onDropOnCard: (target) => drop(target.status, target.id),
  }

  return (
    <div className={styles.root}>
      <div className={panelStyles.row}>
        <div className={styles.search}>
          <Search size={13} />
          <input
            className={panelStyles.input}
            data-testid="task-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t({ en: 'Search tasks…', fr: 'Rechercher des tâches…' })}
          />
        </div>
      </div>
      {error && (
        <div className={styles.errorBanner} data-testid="task-error">
          <span className={panelStyles.grow}>{error}</span>
          <button type="button" onClick={clearBoardError}>
            {t({ en: 'Dismiss', fr: 'Ignorer' })}
          </button>
        </div>
      )}
      <div className={styles.board}>
        {STATUSES.map((status) => (
          <Column
            key={status}
            status={status}
            tasks={columns[status]}
            onDrop={() => drop(status)}
            {...(status === 'in_progress'
              ? {
                  hint: t({
                    en: 'Moving a task here starts it automatically.',
                    fr: 'Déplacer une tâche ici la démarre automatiquement.',
                  }),
                  footer: board && <QueueFooter projectId={projectId} board={board} />,
                }
              : {})}
            action={
              status === 'todo' ? (
                <button
                  type="button"
                  className={panelStyles.primary}
                  data-testid="task-new"
                  onClick={() => setEditor({ task: null })}
                >
                  <Plus size={12} /> {t({ en: 'New task', fr: 'Nouvelle tâche' })}
                </button>
              ) : status === 'done' ? (
                <button type="button" data-testid="task-gates" onClick={() => setGatesOpen(true)}>
                  {t({ en: 'Gates', fr: 'Portes' })}
                </button>
              ) : null
            }
          >
            {columns[status].map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                projectId={projectId}
                queuePosition={queueRank(tasks, task)}
                actions={actions}
              />
            ))}
          </Column>
        ))}
      </div>
      {editor && <TaskEditor projectId={projectId} task={editor.task} onClose={() => setEditor(null)} />}
      {gatesOpen && (
        <GatesEditor projectId={projectId} gates={board?.gates ?? []} onClose={() => setGatesOpen(false)} />
      )}
      {toDelete && (
        <ConfirmDelete
          task={toDelete}
          onCancel={() => setToDelete(null)}
          onConfirm={() => {
            void deleteTask(projectId, toDelete.id)
            setToDelete(null)
          }}
        />
      )}
    </div>
  )
}
