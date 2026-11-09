import { describe, expect, it } from 'vitest'
import type { ProjectTask, TaskSchedule } from '@shared/types.js'
import {
  buildSchedule,
  emptyScheduleForm,
  formatCountdown,
  fromLocalInput,
  scheduleForm,
  seedRecurrence,
  taskPayload,
  toLocalInput,
  validateSchedule,
  type TaskFormValues,
} from './taskForm'

const FIRST_RUN = '2026-11-10T09:00'

const recurring = (over: Partial<Extract<TaskSchedule, { type: 'recurring' }>> = {}): TaskSchedule => ({
  type: 'recurring',
  freq: 'week',
  interval: 2,
  weekdays: [1, 4],
  startAt: fromLocalInput(FIRST_RUN),
  end: { kind: 'never' },
  occurrencesDone: 3,
  nextRunAt: fromLocalInput('2026-12-01T09:00'),
  ...over,
})

const values = (over: Partial<TaskFormValues> = {}): TaskFormValues => ({
  prompt: 'Do it',
  attachments: [],
  agentId: undefined,
  providerId: undefined,
  model: undefined,
  schedule: emptyScheduleForm(),
  ...over,
})

const task = (over: Partial<ProjectTask> = {}): ProjectTask =>
  ({ id: 't1', prompt: 'Do it', attachments: [], status: 'todo', ...over }) as ProjectTask

describe('local datetime inputs', () => {
  it('round-trips through ISO', () => {
    expect(toLocalInput(fromLocalInput(FIRST_RUN))).toBe(FIRST_RUN)
  })

  it('is empty for missing or invalid values', () => {
    expect(toLocalInput(undefined)).toBe('')
    expect(toLocalInput('nope')).toBe('')
    expect(fromLocalInput('')).toBe('')
  })
})

describe('formatCountdown', () => {
  it('uses the largest useful units', () => {
    expect(formatCountdown(45_000)).toBe('45s')
    expect(formatCountdown(5 * 60_000)).toBe('5m')
    expect(formatCountdown(2 * 3_600_000 + 5 * 60_000)).toBe('2h 5m')
    expect(formatCountdown(3 * 86_400_000 + 4 * 3_600_000)).toBe('3d 4h')
  })
})

describe('schedule form', () => {
  it('rebuilds a recurring rule without inventing fields for other frequencies', () => {
    const built = buildSchedule(scheduleForm(recurring()))
    expect(built).toMatchObject({ type: 'recurring', freq: 'week', interval: 2, weekdays: [1, 4] })
    expect(built).not.toHaveProperty('monthDay')
    expect(built).not.toHaveProperty('yearMonth')
  })

  it('returns no schedule when off', () => {
    expect(buildSchedule(emptyScheduleForm())).toBeUndefined()
  })

  it('keeps month and day for a yearly rule', () => {
    const form = { ...scheduleForm(recurring()), freq: 'year' as const, monthDay: 14, yearMonth: 7 }
    expect(buildSchedule(form)).toMatchObject({ freq: 'year', monthDay: 14, yearMonth: 7 })
  })

  it('maps each end kind', () => {
    const base = scheduleForm(recurring())
    expect(buildSchedule({ ...base, endKind: 'count', count: 5 })).toMatchObject({ end: { kind: 'count', count: 5 } })
    expect(buildSchedule({ ...base, endKind: 'until', until: FIRST_RUN })).toMatchObject({
      end: { kind: 'until', until: fromLocalInput(FIRST_RUN) },
    })
  })

  it('seeds a new recurrence from the next full hour', () => {
    const seeded = seedRecurrence(new Date(2026, 10, 9, 14, 20))
    expect(seeded.startAt).toBe('2026-11-09T15:00')
    expect(seeded.monthDay).toBe(9)
    expect(seeded.yearMonth).toBe(11)
    expect(seeded.weekdays).toEqual([new Date(2026, 10, 9).getDay()])
  })

  it('rejects incomplete rules', () => {
    expect(validateSchedule({ ...emptyScheduleForm(), mode: 'once' })).not.toBeNull()
    const form = scheduleForm(recurring())
    expect(validateSchedule(form)).toBeNull()
    expect(validateSchedule({ ...form, startAt: '' })).not.toBeNull()
    expect(validateSchedule({ ...form, weekdays: [] })).not.toBeNull()
    expect(validateSchedule({ ...form, endKind: 'until', until: '' })).not.toBeNull()
  })
})

describe('taskPayload', () => {
  it('creates with only what was chosen', () => {
    expect(taskPayload(values(), null)).toEqual({ prompt: 'Do it' })
  })

  it('pins model and agent on creation', () => {
    expect(taskPayload(values({ agentId: 'builder', providerId: 'p', model: 'm' }), null)).toEqual({
      prompt: 'Do it',
      agentId: 'builder',
      providerId: 'p',
      model: 'm',
    })
  })

  it('clears a pinned agent, provider and model on edit', () => {
    const payload = taskPayload(values(), task({ agentId: 'a', providerId: 'p', model: 'm' }))
    expect(payload).toMatchObject({ agentId: null, providerId: null, model: null })
  })

  it('sends an empty attachment list on edit so removals are saved', () => {
    const attachment = { id: 'a', filename: 'x', mimeType: 'text/plain', size: 1, data: 'x' }
    expect(taskPayload(values(), task({ attachments: [attachment] })).attachments).toEqual([])
  })

  it('leaves an unchanged schedule alone to preserve its live counters', () => {
    const schedule = recurring()
    const payload = taskPayload(values({ schedule: scheduleForm(schedule) }), task({ schedule }))
    expect(payload).not.toHaveProperty('schedule')
  })

  it('sends a changed schedule', () => {
    const schedule = recurring()
    const form = { ...scheduleForm(schedule), interval: 3 }
    expect(taskPayload(values({ schedule: form }), task({ schedule })).schedule).toMatchObject({ interval: 3 })
  })

  it('clears a removed schedule with null', () => {
    expect(taskPayload(values(), task({ schedule: recurring() })).schedule).toBeNull()
  })

  it('does not treat weekday order as a change', () => {
    const schedule = recurring({ weekdays: [4, 1] })
    const form = { ...scheduleForm(schedule), weekdays: [1, 4] }
    expect(taskPayload(values({ schedule: form }), task({ schedule }))).not.toHaveProperty('schedule')
  })
})
