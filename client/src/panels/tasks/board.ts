import type { ProjectTask, ProjectTaskCounts, ProjectTaskSettings, TaskGateConfig, TaskStatus } from '@shared/types.js'
import type { TasksUpdatePayload } from '@shared/protocol.js'

export interface Board {
  tasks: ProjectTask[]
  settings: ProjectTaskSettings
  counts: ProjectTaskCounts
  gates: TaskGateConfig[]
}

export type Columns = Record<TaskStatus, ProjectTask[]>

export type DropStep = { kind: 'move'; to: TaskStatus } | { kind: 'reorder'; status: TaskStatus; index: number }

const MAX_NEXT_UP = 4
const MIN_SLOTS = 1
const MAX_SLOTS = 10

export function nextRunOf(task: ProjectTask): string | undefined {
  const schedule = task.schedule
  if (!schedule) return undefined
  return schedule.type === 'once' ? schedule.runAt : schedule.nextRunAt
}

const byPosition = (a: ProjectTask, b: ProjectTask) => a.position - b.position

function byScheduleThenPosition(a: ProjectTask, b: ProjectTask): number {
  const nextA = nextRunOf(a)
  const nextB = nextRunOf(b)
  if (nextA && nextB) return nextA.localeCompare(nextB)
  if (nextA) return -1
  if (nextB) return 1
  return byPosition(a, b)
}

function byRunningThenPosition(a: ProjectTask, b: ProjectTask): number {
  if ((a.runState === 'running') !== (b.runState === 'running')) return a.runState === 'running' ? -1 : 1
  return byPosition(a, b)
}

export function arrangeColumns(tasks: ProjectTask[], search: string): Columns {
  const needle = search.trim().toLowerCase()
  const visible = needle ? tasks.filter((task) => task.prompt.toLowerCase().includes(needle)) : tasks
  const column = (status: TaskStatus) => visible.filter((task) => task.status === status)
  return {
    todo: column('todo').sort(byScheduleThenPosition),
    in_progress: column('in_progress').sort(byRunningThenPosition),
    done: column('done').sort(byPosition),
  }
}

/** The server truth first; the rank among queued tasks while a push is settling. */
export function queueRank(tasks: ProjectTask[], task: ProjectTask): number | undefined {
  if (task.runState !== 'queued') return undefined
  if (task.queuePosition !== undefined) return task.queuePosition
  const queued = tasks.filter((item) => item.status === 'in_progress' && item.runState === 'queued').sort(byPosition)
  return queued.findIndex((item) => item.id === task.id) + 1
}

/** Index in the server's position order, which search and the planned float don't change. */
function serverIndex(tasks: ProjectTask[], status: TaskStatus, id: string): number {
  return tasks
    .filter((task) => task.status === status)
    .sort(byPosition)
    .findIndex((task) => task.id === id)
}

export function planDrop(
  tasks: ProjectTask[],
  dragged: ProjectTask,
  status: TaskStatus,
  targetId?: string,
): DropStep[] {
  if (targetId === dragged.id) return []
  const steps: DropStep[] = dragged.status === status ? [] : [{ kind: 'move', to: status }]
  if (targetId === undefined) return steps
  const index = serverIndex(tasks, status, targetId)
  return index < 0 ? steps : [...steps, { kind: 'reorder', status, index }]
}

/** Moves a card past its neighbour on screen, or null at the edge of the column. */
export function planShift(
  tasks: ProjectTask[],
  task: ProjectTask,
  delta: -1 | 1,
): { status: TaskStatus; index: number } | null {
  const column = arrangeColumns(tasks, '')[task.status]
  const neighbour = column[column.findIndex((item) => item.id === task.id) + delta]
  return neighbour ? { status: task.status, index: serverIndex(tasks, task.status, neighbour.id) } : null
}

export function stepSlot(current: number, delta: -1 | 1): number {
  return Math.max(MIN_SLOTS, Math.min(MAX_SLOTS, current + delta))
}

export function nextUpTasks(tasks: ProjectTask[]): ProjectTask[] {
  return tasks
    .filter((task) => task.status === 'todo' && task.sessionIds.length === 0)
    .sort(byPosition)
    .slice(0, MAX_NEXT_UP)
}

export function mergeBoardUpdate(board: Board | undefined, update: TasksUpdatePayload): Board {
  return {
    tasks: update.tasks,
    settings: update.settings,
    counts: update.counts,
    gates: update.gates ?? board?.gates ?? [],
  }
}
