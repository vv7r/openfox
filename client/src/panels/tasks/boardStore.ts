import { useEffect } from 'react'
import { create } from 'zustand'
import type { TasksUpdatePayload } from '@shared/protocol.js'
import type { ProjectTask, ProjectTaskSettings, TaskGateConfig, TaskStatus } from '@shared/types.js'
import { authFetch, getJson } from '../../api'
import { subscribeMessages } from '../../controller'
import { t } from '../../i18n'
import { mergeBoardUpdate, planDrop, planShift, type Board } from './board'
import type { TaskPayload } from './taskForm'

interface BoardsState {
  boards: Record<string, Board>
  error: string | null
}

export const useBoards = create<BoardsState>(() => ({ boards: {}, error: null }))

/** Bumped by every load and push, so a slower older response can't overwrite newer data. */
const revisions = new Map<string, number>()

function nextRevision(projectId: string): number {
  const revision = (revisions.get(projectId) ?? 0) + 1
  revisions.set(projectId, revision)
  return revision
}

function writeBoard(projectId: string, board: Board): void {
  useBoards.setState((state) => ({ boards: { ...state.boards, [projectId]: board } }))
}

export async function loadBoard(projectId: string): Promise<void> {
  const revision = nextRevision(projectId)
  const board = await getJson<Board>(`/api/projects/${projectId}/tasks`).catch(() => null)
  if (board && revisions.get(projectId) === revision) writeBoard(projectId, board)
}

function applyPush(update: TasksUpdatePayload): void {
  nextRevision(update.projectId)
  writeBoard(update.projectId, mergeBoardUpdate(useBoards.getState().boards[update.projectId], update))
}

/** Loads the project's board and keeps it in step with the server's pushes. */
export function useBoard(projectId: string | null | undefined): Board | undefined {
  useEffect(() => {
    if (!projectId) return
    void loadBoard(projectId)
    return subscribeMessages((message) => {
      if (message.type === 'tasks.update') applyPush(message.payload as TasksUpdatePayload)
    })
  }, [projectId])
  return useBoards((state) => (projectId ? state.boards[projectId] : undefined))
}

export function clearBoardError(): void {
  useBoards.setState({ error: null })
}

const FAILED = { en: 'The task could not be updated', fr: 'Impossible de mettre à jour la tâche' }

/** Null on failure, with the server's reason exposed as the board error. */
async function request<T>(
  projectId: string,
  path: string,
  method: 'POST' | 'PUT' | 'DELETE',
  body?: unknown,
): Promise<T | null> {
  try {
    const response = await authFetch(`/api/projects/${projectId}/tasks${path}`, {
      method,
      ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    })
    const data = (await response.json().catch(() => ({}))) as T & { error?: string }
    if (!response.ok) {
      useBoards.setState({ error: data.error ?? t(FAILED) })
      return null
    }
    useBoards.setState({ error: null })
    return data
  } catch {
    useBoards.setState({ error: t(FAILED) })
    return null
  }
}

interface TaskResponse {
  task: ProjectTask
}

async function mutate<T>(projectId: string, run: () => Promise<T>): Promise<T> {
  const result = await run()
  await loadBoard(projectId)
  return result
}

export function saveTask(projectId: string, taskId: string | null, payload: TaskPayload) {
  return mutate(projectId, () =>
    taskId
      ? request<TaskResponse>(projectId, `/${taskId}`, 'PUT', payload)
      : request<TaskResponse>(projectId, '', 'POST', payload),
  )
}

export function deleteTask(projectId: string, taskId: string) {
  return mutate(projectId, () => request(projectId, `/${taskId}`, 'DELETE'))
}

export function duplicateTask(projectId: string, taskId: string) {
  return mutate(projectId, () => request<TaskResponse>(projectId, `/${taskId}/duplicate`, 'POST'))
}

export function moveTask(projectId: string, task: ProjectTask, to: TaskStatus, sessionId?: string) {
  return mutate(projectId, () =>
    request<TaskResponse>(projectId, `/${task.id}/move`, 'POST', {
      to,
      expectedVersion: task.version,
      ...(sessionId ? { sessionId } : {}),
    }),
  )
}

function reorder(projectId: string, taskId: string, status: TaskStatus, index: number) {
  return request(projectId, `/${taskId}/reorder`, 'POST', { status, index })
}

export function dropTask(
  projectId: string,
  tasks: ProjectTask[],
  task: ProjectTask,
  to: TaskStatus,
  targetId?: string,
) {
  return mutate(projectId, async () => {
    for (const step of planDrop(tasks, task, to, targetId)) {
      const result =
        step.kind === 'move'
          ? await request(projectId, `/${task.id}/move`, 'POST', { to: step.to, expectedVersion: task.version })
          : await reorder(projectId, task.id, step.status, step.index)
      if (!result) return
    }
  })
}

export function shiftTask(projectId: string, tasks: ProjectTask[], task: ProjectTask, delta: -1 | 1) {
  const shift = planShift(tasks, task, delta)
  if (!shift) return Promise.resolve()
  return mutate(projectId, () => reorder(projectId, task.id, shift.status, shift.index))
}

export function saveGates(projectId: string, gates: TaskGateConfig[]) {
  return mutate(projectId, () => request(projectId, '/gates', 'PUT', { gates }))
}

/** Applied at once so rapid +/- clicks add up; the server's push reconciles any difference. */
export function updateBoardSettings(projectId: string, settings: Partial<ProjectTaskSettings>): void {
  const board = useBoards.getState().boards[projectId]
  if (board) writeBoard(projectId, { ...board, settings: { ...board.settings, ...settings } })
  void request(projectId, '/settings', 'PUT', settings)
}

export function currentSettings(projectId: string): ProjectTaskSettings | undefined {
  return useBoards.getState().boards[projectId]?.settings
}
