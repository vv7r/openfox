import { getLocale, t, type Translation } from '@shared/i18n/index.js'
import type { Attachment, ProjectTask, TaskSchedule } from '@shared/types.js'

export type ScheduleMode = 'none' | 'once' | 'recurring'
export type RecurFreq = 'day' | 'week' | 'month' | 'year'
export type RecurEndKind = 'never' | 'until' | 'count'
type RecurringSchedule = Extract<TaskSchedule, { type: 'recurring' }>

export interface ScheduleForm {
  mode: ScheduleMode
  onceRunAt: string
  freq: RecurFreq
  interval: number
  weekdays: number[]
  monthDay: number
  yearMonth: number
  startAt: string
  endKind: RecurEndKind
  until: string
  count: number
}

export interface TaskFormValues {
  prompt: string
  attachments: Attachment[]
  agentId: string | undefined
  providerId: string | undefined
  model: string | undefined
  schedule: ScheduleForm
}

export interface TaskPayload {
  prompt: string
  attachments?: Attachment[]
  agentId?: string | null
  providerId?: string | null
  model?: string | null
  schedule?: TaskSchedule | null
}

const pad2 = (value: number) => String(value).padStart(2, '0')

/** ISO to the local "YYYY-MM-DDTHH:mm" of `<input type="datetime-local">`. */
export function toLocalInput(iso: string | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

export function fromLocalInput(value: string): string {
  return value ? new Date(value).toISOString() : ''
}

export function weekdayLabel(day: number): string {
  // 2024-01-07 was a Sunday
  return new Intl.DateTimeFormat(getLocale(), { weekday: 'short' }).format(new Date(2024, 0, 7 + day))
}

export function monthLabel(month: number): string {
  return new Intl.DateTimeFormat(getLocale(), { month: 'long' }).format(new Date(2026, month - 1, 1))
}

export function formatCountdown(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
  return `${Math.floor(seconds / 86_400)}d ${Math.floor((seconds % 86_400) / 3600)}h`
}

export function emptyScheduleForm(): ScheduleForm {
  return {
    mode: 'none',
    onceRunAt: '',
    freq: 'day',
    interval: 1,
    weekdays: [],
    monthDay: 1,
    yearMonth: 1,
    startAt: '',
    endKind: 'never',
    until: '',
    count: 1,
  }
}

export function scheduleForm(schedule: TaskSchedule | undefined): ScheduleForm {
  const empty = emptyScheduleForm()
  if (!schedule) return empty
  if (schedule.type === 'once') return { ...empty, mode: 'once', onceRunAt: toLocalInput(schedule.runAt) }
  return {
    ...empty,
    mode: 'recurring',
    freq: schedule.freq,
    interval: schedule.interval,
    weekdays: schedule.weekdays ?? [],
    monthDay: schedule.monthDay ?? 1,
    yearMonth: schedule.yearMonth ?? 1,
    startAt: toLocalInput(schedule.startAt),
    endKind: schedule.end.kind,
    until: schedule.end.kind === 'until' ? toLocalInput(schedule.end.until) : '',
    count: schedule.end.kind === 'count' ? schedule.end.count : 1,
  }
}

/** First run on the next full hour, with the repeat-on selectors derived from it. */
export function seedRecurrence(now: Date): Pick<ScheduleForm, 'startAt' | 'weekdays' | 'monthDay' | 'yearMonth'> {
  const first = new Date(now.getTime() + 3_600_000)
  first.setMinutes(0, 0, 0)
  return {
    startAt: toLocalInput(first.toISOString()),
    weekdays: [first.getDay()],
    monthDay: first.getDate(),
    yearMonth: first.getMonth() + 1,
  }
}

export function validateSchedule(form: ScheduleForm): Translation | null {
  if (form.mode === 'once' && !form.onceRunAt) {
    return { en: 'Choose a run time for the schedule', fr: 'Choisissez une heure d’exécution' }
  }
  if (form.mode !== 'recurring') return null
  if (!form.startAt) {
    return { en: 'Choose a first run date and time', fr: 'Choisissez une date et heure de première exécution' }
  }
  if (form.freq === 'week' && form.weekdays.length === 0) {
    return { en: 'Pick at least one weekday for the recurrence', fr: 'Sélectionnez au moins un jour de la semaine' }
  }
  if (form.endKind === 'until' && !form.until) {
    return { en: 'Choose an end date for the recurrence', fr: 'Choisissez une date de fin de récurrence' }
  }
  return null
}

function buildEnd(form: ScheduleForm): RecurringSchedule['end'] {
  if (form.endKind === 'until') return { kind: 'until', until: fromLocalInput(form.until) }
  if (form.endKind === 'count') return { kind: 'count', count: form.count }
  return { kind: 'never' }
}

export function buildSchedule(form: ScheduleForm): TaskSchedule | undefined {
  if (form.mode === 'none') return undefined
  if (form.mode === 'once') return { type: 'once', runAt: fromLocalInput(form.onceRunAt) }
  const startAt = fromLocalInput(form.startAt)
  return {
    type: 'recurring',
    freq: form.freq,
    interval: form.interval,
    ...(form.freq === 'week' ? { weekdays: form.weekdays } : {}),
    ...(form.freq === 'month' || form.freq === 'year' ? { monthDay: form.monthDay } : {}),
    ...(form.freq === 'year' ? { yearMonth: form.yearMonth } : {}),
    startAt,
    end: buildEnd(form),
    occurrencesDone: 0,
    nextRunAt: startAt,
  }
}

const instant = (iso: string) => new Date(iso).getTime()

/** The rule the user controls, without the counters owned by the server. */
function ruleSignature(schedule: TaskSchedule): string {
  if (schedule.type === 'once') return JSON.stringify({ runAt: instant(schedule.runAt) })
  return JSON.stringify({
    freq: schedule.freq,
    interval: schedule.interval,
    weekdays: schedule.weekdays ? [...schedule.weekdays].sort() : null,
    monthDay: schedule.monthDay ?? null,
    yearMonth: schedule.yearMonth ?? null,
    startAt: instant(schedule.startAt),
    end: schedule.end.kind === 'until' ? instant(schedule.end.until) : schedule.end,
  })
}

/** What to send: editing can unpin a value (null), and an unchanged schedule keeps its live counters. */
export function taskPayload(values: TaskFormValues, initial: ProjectTask | null): TaskPayload {
  const { prompt, attachments, agentId, providerId, model } = values
  const schedule = buildSchedule(values.schedule)
  if (!initial) {
    return {
      prompt,
      ...(attachments.length > 0 ? { attachments } : {}),
      ...(agentId ? { agentId } : {}),
      ...(providerId ? { providerId } : {}),
      ...(model ? { model } : {}),
      ...(schedule ? { schedule } : {}),
    }
  }
  const unchanged = schedule && initial.schedule && ruleSignature(schedule) === ruleSignature(initial.schedule)
  return {
    prompt,
    attachments,
    agentId: agentId ?? null,
    ...(providerId ? { providerId } : initial.providerId ? { providerId: null } : {}),
    ...(model ? { model } : initial.model ? { model: null } : {}),
    ...(unchanged ? {} : { schedule: schedule ?? null }),
  }
}

/** Short description of a recurring rule, e.g. "every 2 weeks · Mon, Thu". */
export function recurrenceLabel(schedule: RecurringSchedule): string {
  const count = schedule.interval
  const cadences: Record<RecurFreq, [Translation, Translation]> = {
    day: [
      { en: 'every day', fr: 'tous les jours' },
      { en: 'every {{count}} days', fr: 'tous les {{count}} jours' },
    ],
    week: [
      { en: 'every week', fr: 'chaque semaine' },
      { en: 'every {{count}} weeks', fr: 'toutes les {{count}} semaines' },
    ],
    month: [
      { en: 'every month', fr: 'chaque mois' },
      { en: 'every {{count}} months', fr: 'tous les {{count}} mois' },
    ],
    year: [
      { en: 'every year', fr: 'chaque année' },
      { en: 'every {{count}} years', fr: 'toutes les {{count}} années' },
    ],
  }
  const [single, several] = cadences[schedule.freq]
  const cadence = count === 1 ? t(single) : t(several, { count })
  if (schedule.freq === 'week' && schedule.weekdays?.length) {
    const days = [...schedule.weekdays].sort((a, b) => a - b).map(weekdayLabel)
    return `${cadence} · ${days.join(', ')}`
  }
  if (schedule.freq === 'month' && schedule.monthDay) {
    return `${cadence} · ${t({ en: 'day {{count}}', fr: 'jour {{count}}' }, { count: schedule.monthDay })}`
  }
  if (schedule.freq === 'year' && schedule.yearMonth && schedule.monthDay) {
    return `${cadence} · ${monthLabel(schedule.yearMonth)} ${schedule.monthDay}`
  }
  return cadence
}
