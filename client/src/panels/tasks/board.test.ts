import { describe, expect, it } from 'vitest'
import type { ProjectTask } from '@shared/types.js'
import {
  arrangeColumns,
  mergeBoardUpdate,
  nextUpTasks,
  planDrop,
  planShift,
  queueRank,
  stepSlot,
  type Board,
} from './board'

function task(id: string, status: ProjectTask['status'], position: number, over: Partial<ProjectTask> = {}) {
  return { id, status, position, prompt: id, sessionIds: [], ...over } as ProjectTask
}

const ids = (list: ProjectTask[]) => list.map((item) => item.id)

describe('arrangeColumns', () => {
  it('floats planned tasks to the top of To do, soonest first', () => {
    const tasks = [
      task('plain', 'todo', 0),
      task('later', 'todo', 1, { schedule: { type: 'once', runAt: '2026-12-02T00:00:00.000Z' } }),
      task('soon', 'todo', 2, { schedule: { type: 'once', runAt: '2026-12-01T00:00:00.000Z' } }),
    ]
    expect(ids(arrangeColumns(tasks, '').todo)).toEqual(['soon', 'later', 'plain'])
  })

  it('puts running tasks before queued ones', () => {
    const tasks = [
      task('q', 'in_progress', 0, { runState: 'queued' }),
      task('r', 'in_progress', 1, { runState: 'running' }),
    ]
    expect(ids(arrangeColumns(tasks, '').in_progress)).toEqual(['r', 'q'])
  })

  it('filters on the prompt, ignoring case', () => {
    const tasks = [task('Fix login', 'todo', 0), task('Write docs', 'done', 0)]
    const columns = arrangeColumns(tasks, 'LOGIN')
    expect(ids(columns.todo)).toEqual(['Fix login'])
    expect(columns.done).toEqual([])
  })
})

describe('queueRank', () => {
  it('prefers the position sent by the server', () => {
    const queued = task('a', 'in_progress', 5, { runState: 'queued', queuePosition: 2 })
    expect(queueRank([queued], queued)).toBe(2)
  })

  it('falls back to the rank among queued tasks', () => {
    const first = task('a', 'in_progress', 1, { runState: 'queued' })
    const second = task('b', 'in_progress', 2, { runState: 'queued' })
    expect(queueRank([second, first], second)).toBe(2)
  })

  it('is undefined for a task that is not queued', () => {
    const running = task('a', 'in_progress', 1, { runState: 'running' })
    expect(queueRank([running], running)).toBeUndefined()
  })
})

describe('planDrop', () => {
  const tasks = [task('a', 'todo', 0), task('b', 'todo', 1), task('c', 'todo', 2), task('d', 'done', 0)]

  it('does nothing when dropped on its own card or column', () => {
    expect(planDrop(tasks, tasks[0]!, 'todo', 'a')).toEqual([])
    expect(planDrop(tasks, tasks[0]!, 'todo')).toEqual([])
  })

  it('moves when dropped on another column', () => {
    expect(planDrop(tasks, tasks[0]!, 'done')).toEqual([{ kind: 'move', to: 'done' }])
  })

  it('takes the place of the target in the same column', () => {
    expect(planDrop(tasks, tasks[0]!, 'todo', 'c')).toEqual([{ kind: 'reorder', status: 'todo', index: 2 }])
  })

  it('moves then reorders across columns', () => {
    expect(planDrop(tasks, tasks[3]!, 'todo', 'b')).toEqual([
      { kind: 'move', to: 'todo' },
      { kind: 'reorder', status: 'todo', index: 1 },
    ])
  })

  it('uses the server position, not the filtered or floated display index', () => {
    const planned = task('planned', 'todo', 3, { schedule: { type: 'once', runAt: '2026-12-01T00:00:00.000Z' } })
    expect(planDrop([...tasks, planned], tasks[0]!, 'todo', 'planned')).toEqual([
      { kind: 'reorder', status: 'todo', index: 3 },
    ])
  })
})

describe('planShift', () => {
  const tasks = [task('a', 'todo', 0), task('b', 'todo', 1), task('c', 'todo', 2)]

  it('swaps with the neighbour on screen', () => {
    expect(planShift(tasks, tasks[1]!, -1)).toEqual({ status: 'todo', index: 0 })
    expect(planShift(tasks, tasks[1]!, 1)).toEqual({ status: 'todo', index: 2 })
  })

  it('stops at the column edges', () => {
    expect(planShift(tasks, tasks[0]!, -1)).toBeNull()
    expect(planShift(tasks, tasks[2]!, 1)).toBeNull()
  })
})

describe('stepSlot', () => {
  it('stays between 1 and 10', () => {
    expect(stepSlot(1, -1)).toBe(1)
    expect(stepSlot(10, 1)).toBe(10)
    expect(stepSlot(3, 1)).toBe(4)
  })
})

describe('nextUpTasks', () => {
  it('lists unclaimed To do tasks in board order, four at most', () => {
    const tasks = [
      task('e', 'todo', 4),
      task('claimed', 'todo', 0, { sessionIds: ['s'] }),
      task('a', 'todo', 1),
      task('b', 'todo', 2),
      task('c', 'todo', 3),
      task('f', 'todo', 5),
      task('done', 'done', 0),
    ]
    expect(ids(nextUpTasks(tasks))).toEqual(['a', 'b', 'c', 'e'])
  })
})

describe('mergeBoardUpdate', () => {
  const board: Board = {
    tasks: [task('a', 'todo', 0)],
    settings: { slotLimit: 2, queuePaused: false },
    counts: { open: 1, todo: 1, inProgress: 0, running: 0, queued: 0, done: 0 },
    gates: [{ id: 'g', name: 'g', description: '', required: true, variant: 'done' }],
  }

  it('keeps the gates when the update has none', () => {
    const merged = mergeBoardUpdate(board, {
      projectId: 'p',
      tasks: [],
      settings: { slotLimit: 3, queuePaused: true },
      counts: { ...board.counts, todo: 0, open: 0 },
    })
    expect(merged.tasks).toEqual([])
    expect(merged.settings.slotLimit).toBe(3)
    expect(merged.gates).toEqual(board.gates)
  })

  it('starts from an empty board', () => {
    const merged = mergeBoardUpdate(undefined, {
      projectId: 'p',
      tasks: board.tasks,
      settings: board.settings,
      counts: board.counts,
    })
    expect(merged.gates).toEqual([])
    expect(merged.tasks).toEqual(board.tasks)
  })
})
