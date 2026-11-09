import { t } from '../../i18n'
import panelStyles from '../Panels.module.css'
import {
  monthLabel,
  seedRecurrence,
  weekdayLabel,
  type RecurEndKind,
  type RecurFreq,
  type ScheduleForm,
  type ScheduleMode,
} from './taskForm'
import styles from './Tasks.module.css'

/** Monday first; values follow Date.getDay(), where 0 is Sunday. */
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]
const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1)

const MODES: Array<{ value: ScheduleMode; en: string; fr: string }> = [
  { value: 'none', en: 'No schedule', fr: 'Aucune planification' },
  { value: 'once', en: 'Run once', fr: 'Exécuter une fois' },
  { value: 'recurring', en: 'Repeat', fr: 'Répéter' },
]

const FREQUENCIES: Array<{ value: RecurFreq; en: string; fr: string }> = [
  { value: 'day', en: 'day(s)', fr: 'jour(s)' },
  { value: 'week', en: 'week(s)', fr: 'semaine(s)' },
  { value: 'month', en: 'month(s)', fr: 'mois' },
  { value: 'year', en: 'year(s)', fr: 'année(s)' },
]

const ENDS: Array<{ value: RecurEndKind; en: string; fr: string }> = [
  { value: 'never', en: 'Never', fr: 'Jamais' },
  { value: 'until', en: 'On date', fr: 'À une date' },
  { value: 'count', en: 'After N occurrences', fr: 'Après N occurrences' },
]

const atLeastOne = (value: string) => Math.max(1, Number(value) || 1)
const dayOfMonth = (value: string) => Math.min(31, atLeastOne(value))

interface Props {
  form: ScheduleForm
  onChange: (change: Partial<ScheduleForm>) => void
}

function DayOfMonth({ form, onChange }: Props) {
  return (
    <input
      type="number"
      min={1}
      max={31}
      className={`${panelStyles.input} ${styles.number}`}
      value={form.monthDay}
      aria-label={t({ en: 'Day of month', fr: 'Jour du mois' })}
      onChange={(event) => onChange({ monthDay: dayOfMonth(event.target.value) })}
    />
  )
}

function RepeatOn({ form, onChange }: Props) {
  if (form.freq === 'day') return null
  return (
    <div className={panelStyles.field}>
      <span>{t({ en: 'Repeat on', fr: 'Répéter le' })}</span>
      {form.freq === 'week' && (
        <div className={styles.chips}>
          {WEEKDAY_ORDER.map((day) => {
            const active = form.weekdays.includes(day)
            return (
              <button
                key={day}
                type="button"
                className={styles.toggleChip}
                aria-pressed={active}
                onClick={() =>
                  onChange({
                    weekdays: active ? form.weekdays.filter((d) => d !== day) : [...form.weekdays, day].sort(),
                  })
                }
              >
                {weekdayLabel(day)}
              </button>
            )
          })}
        </div>
      )}
      {form.freq === 'month' && <DayOfMonth form={form} onChange={onChange} />}
      {form.freq === 'year' && (
        <div className={panelStyles.row}>
          <select
            className={panelStyles.select}
            value={form.yearMonth}
            aria-label={t({ en: 'Month', fr: 'Mois' })}
            onChange={(event) => onChange({ yearMonth: Number(event.target.value) })}
          >
            {MONTHS.map((month) => (
              <option key={month} value={month}>
                {monthLabel(month)}
              </option>
            ))}
          </select>
          <DayOfMonth form={form} onChange={onChange} />
        </div>
      )}
    </div>
  )
}

function Recurrence({ form, onChange }: Props) {
  return (
    <>
      <div className={styles.twoColumns}>
        <label className={panelStyles.field}>
          {t({ en: 'First run (date and time)', fr: 'Première exécution (date et heure)' })}
          <input
            type="datetime-local"
            className={panelStyles.input}
            value={form.startAt}
            onChange={(event) => onChange({ startAt: event.target.value })}
          />
        </label>
        <div className={panelStyles.field}>
          <span>{t({ en: 'Repeat every', fr: 'Répéter tous les' })}</span>
          <div className={panelStyles.row}>
            <input
              type="number"
              min={1}
              className={`${panelStyles.input} ${styles.number}`}
              value={form.interval}
              aria-label={t({ en: 'Interval', fr: 'Intervalle' })}
              onChange={(event) => onChange({ interval: atLeastOne(event.target.value) })}
            />
            <select
              className={panelStyles.select}
              value={form.freq}
              aria-label={t({ en: 'Repeat unit', fr: 'Unité de répétition' })}
              onChange={(event) => onChange({ freq: event.target.value as RecurFreq })}
            >
              {FREQUENCIES.map((frequency) => (
                <option key={frequency.value} value={frequency.value}>
                  {t(frequency)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
      <RepeatOn form={form} onChange={onChange} />
      <div className={panelStyles.field}>
        <span>{t({ en: 'Ends', fr: 'Se termine' })}</span>
        {ENDS.map((end) => (
          <label key={end.value} className={panelStyles.check}>
            <input
              type="radio"
              name="task-recur-end"
              checked={form.endKind === end.value}
              onChange={() => onChange({ endKind: end.value })}
            />
            {t(end)}
          </label>
        ))}
        {form.endKind === 'until' && (
          <input
            type="datetime-local"
            className={panelStyles.input}
            value={form.until}
            aria-label={t({ en: 'End date', fr: 'Date de fin' })}
            onChange={(event) => onChange({ until: event.target.value })}
          />
        )}
        {form.endKind === 'count' && (
          <input
            type="number"
            min={1}
            className={`${panelStyles.input} ${styles.number}`}
            value={form.count}
            aria-label={t({ en: 'Occurrences', fr: 'Occurrences' })}
            onChange={(event) => onChange({ count: atLeastOne(event.target.value) })}
          />
        )}
      </div>
    </>
  )
}

export function ScheduleFields({ form, onChange }: Props) {
  const selectMode = (mode: ScheduleMode) => {
    onChange({ mode, ...(mode === 'recurring' && !form.startAt ? seedRecurrence(new Date()) : {}) })
  }
  return (
    <fieldset className={styles.schedule}>
      <legend className={panelStyles.muted}>{t({ en: 'Schedule', fr: 'Planification' })}</legend>
      <div className={styles.chips}>
        {MODES.map((mode) => (
          <button
            key={mode.value}
            type="button"
            className={styles.toggleChip}
            aria-pressed={form.mode === mode.value}
            onClick={() => selectMode(mode.value)}
          >
            {t(mode)}
          </button>
        ))}
      </div>
      {form.mode === 'once' && (
        <label className={panelStyles.field}>
          {t({ en: 'Run at', fr: 'Exécuter à' })}
          <input
            type="datetime-local"
            className={panelStyles.input}
            value={form.onceRunAt}
            onChange={(event) => onChange({ onceRunAt: event.target.value })}
          />
        </label>
      )}
      {form.mode === 'recurring' && <Recurrence form={form} onChange={onChange} />}
    </fieldset>
  )
}
