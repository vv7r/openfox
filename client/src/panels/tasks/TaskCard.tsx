import { useEffect, useState } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  ExternalLink,
  Info,
  MoreHorizontal,
  Paperclip,
  Pause,
  Pencil,
  Play,
  Trash2,
} from 'lucide-react'
import { getLocale, type Translation } from '@shared/i18n/index.js'
import type { ProjectTask, TaskSchedule, TaskStatus } from '@shared/types.js'
import { openPanel } from '../../controller'
import feedStyles from '../../feed/Feed.module.css'
import { t } from '../../i18n'
import { navigate } from '../../router'
import { useApp } from '../../store/app'
import { formatCountdown, recurrenceLabel } from './taskForm'
import styles from './Tasks.module.css'

const COUNTDOWN_REFRESH_MS = 30_000

export const STATUS_LABELS: Record<TaskStatus, Translation> = {
  todo: { en: 'To do', fr: 'À faire' },
  in_progress: { en: 'In progress', fr: 'En cours' },
  done: { en: 'Done', fr: 'Terminé' },
}

export interface CardActions {
  onEdit: (task: ProjectTask) => void
  onMove: (task: ProjectTask, to: TaskStatus) => void
  onShift: (task: ProjectTask, delta: -1 | 1) => void
  onDuplicate: (task: ProjectTask) => void
  onDelete: (task: ProjectTask) => void
  onDragStart: (task: ProjectTask) => void
  onDropOnCard: (task: ProjectTask) => void
}

function ScheduleBadge({ schedule }: { schedule: TaskSchedule }) {
  const [, tick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => tick((value) => value + 1), COUNTDOWN_REFRESH_MS)
    return () => clearInterval(timer)
  }, [])
  const nextRunAt = schedule.type === 'once' ? schedule.runAt : schedule.nextRunAt
  const remaining = new Date(nextRunAt).getTime() - Date.now()
  return (
    <span
      className={styles.chip}
      data-testid="task-schedule"
      title={t({ en: 'Planned task, triggers automatically', fr: 'Tâche planifiée, se déclenche automatiquement' })}
    >
      <Clock size={11} />
      {schedule.type === 'recurring' && <span>{recurrenceLabel(schedule)}</span>}
      <span>
        {remaining <= 0
          ? t({ en: 'now', fr: 'maintenant' })
          : t({ en: 'in {{time}}', fr: 'dans {{time}}' }, { time: formatCountdown(remaining) })}
      </span>
    </span>
  )
}

function RunBadge({ task, queuePosition }: { task: ProjectTask; queuePosition: number | undefined }) {
  const running = task.runState === 'running'
  return (
    <span className={styles.runBadge} data-running={running || undefined}>
      {running ? <Play size={10} /> : <Pause size={10} />}
      {running
        ? t({ en: 'Running', fr: 'En cours' })
        : t(
            { en: 'Queued{{position}}', fr: 'En file{{position}}' },
            { position: queuePosition === undefined ? '' : ` · ${queuePosition}` },
          )}
    </span>
  )
}

interface MenuProps {
  task: ProjectTask
  actions: CardActions
  onToggleHistory: () => void
}

function CardMenu({ task, actions, onToggleHistory }: MenuProps) {
  const item = (label: Translation, Icon: typeof Info | null, onSelect: () => void, danger?: boolean) => (
    <DropdownMenu.Item
      className={`${feedStyles.menuItem} ${styles.menuRow}`}
      data-danger={danger || undefined}
      onSelect={onSelect}
    >
      {Icon && <Icon size={13} />}
      {t(label)}
    </DropdownMenu.Item>
  )
  return (
    // React events bubble through portals: keep the menu's clicks away from the card
    <div className={styles.cardMenu} onClick={(event) => event.stopPropagation()}>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          className={styles.menuTrigger}
          aria-label={t({ en: 'Task actions', fr: 'Actions de la tâche' })}
          data-testid="task-menu"
        >
          <MoreHorizontal size={15} />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className={feedStyles.menu} align="end" sideOffset={4}>
            {item({ en: 'Edit', fr: 'Modifier' }, Pencil, () => actions.onEdit(task))}
            {item({ en: 'History', fr: 'Historique' }, Info, onToggleHistory)}
            <DropdownMenu.Separator className={styles.menuSeparator} />
            <DropdownMenu.Label className={styles.menuLabel}>
              {t({ en: 'Move to', fr: 'Déplacer vers' })}
            </DropdownMenu.Label>
            {(Object.keys(STATUS_LABELS) as TaskStatus[]).map((status) => (
              <DropdownMenu.Item
                key={status}
                className={`${feedStyles.menuItem} ${styles.menuRow}`}
                disabled={status === task.status}
                onSelect={() => actions.onMove(task, status)}
              >
                {t(STATUS_LABELS[status])}
              </DropdownMenu.Item>
            ))}
            {item({ en: 'Move up', fr: 'Monter' }, ChevronUp, () => actions.onShift(task, -1))}
            {item({ en: 'Move down', fr: 'Descendre' }, ChevronDown, () => actions.onShift(task, 1))}
            <DropdownMenu.Separator className={styles.menuSeparator} />
            {item({ en: 'Duplicate', fr: 'Dupliquer' }, Copy, () => actions.onDuplicate(task))}
            {item({ en: 'Delete', fr: 'Supprimer' }, Trash2, () => actions.onDelete(task), true)}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  )
}

function History({ task }: { task: ProjectTask }) {
  return (
    <div className={styles.history} data-testid="task-history">
      <div className={styles.eyebrow}>{t({ en: 'History', fr: 'Historique' })}</div>
      {task.auditTrail.map((entry) => (
        <div key={entry.id}>
          <strong>{entry.action}</strong>
          {entry.detail && ` — ${entry.detail}`}
          <span className={styles.historyMeta}>
            {` · ${entry.actorName ?? entry.actor} · ${new Date(entry.timestamp).toLocaleString(getLocale())}`}
          </span>
        </div>
      ))}
    </div>
  )
}

interface Props {
  task: ProjectTask
  projectId: string
  queuePosition: number | undefined
  actions: CardActions
}

export function TaskCard({ task, projectId, queuePosition, actions }: Props) {
  const agents = useApp((state) => state.agents)
  const [showHistory, setShowHistory] = useState(false)
  const agent = agents.find((candidate) => candidate.id === task.agentId)
  const images = task.attachments.filter((attachment) => attachment.mimeType.startsWith('image/')).slice(0, 3)
  const sessionId = task.activeSessionId ?? task.sessionIds[task.sessionIds.length - 1]

  return (
    <article
      className={styles.card}
      data-testid="task-card"
      data-task-status={task.status}
      draggable
      onClick={() => actions.onEdit(task)}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move'
        actions.onDragStart(task)
      }}
      onDragOver={(event) => {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
      }}
      onDrop={(event) => {
        event.preventDefault()
        event.stopPropagation()
        actions.onDropOnCard(task)
      }}
    >
      {task.status === 'in_progress' && <RunBadge task={task} queuePosition={queuePosition} />}
      <p className={styles.prompt}>{task.prompt}</p>
      <CardMenu task={task} actions={actions} onToggleHistory={() => setShowHistory((value) => !value)} />
      <div className={styles.meta}>
        {task.status === 'todo' && task.schedule && <ScheduleBadge schedule={task.schedule} />}
        {task.attachments.length > 0 && (
          <span className={styles.chip}>
            <Paperclip size={11} />
            {task.attachments.length}
          </span>
        )}
        {images.map((image) => (
          <img key={image.id} className={styles.thumb} src={image.data} alt={image.filename} loading="lazy" />
        ))}
        {task.model && (
          <span className={styles.chip} title={task.model}>
            <span className={styles.truncate}>{task.model}</span>
          </span>
        )}
        {agent && (
          <span className={styles.chip} style={{ color: agent.color }}>
            {agent.name}
          </span>
        )}
        {sessionId && (
          <button
            type="button"
            className={styles.sessionLink}
            onClick={(event) => {
              event.stopPropagation()
              openPanel(null)
              navigate(`/p/${projectId}/s/${sessionId}`)
            }}
          >
            {t({ en: 'Open session', fr: 'Ouvrir la session' })}
            <ExternalLink size={11} />
          </button>
        )}
      </div>
      {showHistory && task.auditTrail.length > 0 && <History task={task} />}
    </article>
  )
}
