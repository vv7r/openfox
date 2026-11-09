import type { Translation } from '@shared/i18n/index.js'
import { t } from '../../i18n'
import { conditionForType } from './editing'
import type { WorkflowCondition } from './types'
import styles from './Workflows.module.css'

export const CONDITION_TYPES: Array<{ value: string; label: Translation }> = [
  { value: 'step_result', label: { en: 'Step result is…', fr: 'Le résultat de l’étape est…' } },
  {
    value: 'metadata_all_match',
    label: { en: 'Metadata all match (key=value)', fr: 'Métadonnées égales (clé=valeur)' },
  },
  { value: 'metadata_all_in', label: { en: 'Metadata all in list', fr: 'Métadonnées dans la liste' } },
  { value: 'always', label: { en: 'Always (fallback)', fr: 'Toujours (par défaut)' } },
]

interface Props {
  label: Translation
  condition: WorkflowCondition
  results: string[] | undefined
  onChange: (condition: WorkflowCondition) => void
}

export function ConditionFields({ label, condition, results, onChange }: Props) {
  const metadata = condition.type === 'metadata_all_match' || condition.type === 'metadata_all_in'
  return (
    <>
      <label className={styles.field}>
        {t(label)}
        <select
          value={condition.type}
          data-testid="condition-type"
          onChange={(event) => onChange(conditionForType(event.target.value))}
        >
          {CONDITION_TYPES.map((option) => (
            <option key={option.value} value={option.value}>
              {t(option.label)}
            </option>
          ))}
        </select>
      </label>
      {condition.type === 'step_result' && (
        <label className={styles.field}>
          {t({ en: 'Result', fr: 'Résultat' })}
          {results?.length ? (
            <select
              value={condition.result ?? results[0]}
              onChange={(event) => onChange({ type: 'step_result', result: event.target.value })}
            >
              {results.map((result) => (
                <option key={result} value={result}>
                  {result}
                </option>
              ))}
            </select>
          ) : (
            <input
              value={condition.result ?? 'success'}
              placeholder={t({ en: 'e.g. success, passed, failed', fr: 'ex. success, passed, failed' })}
              onChange={(event) => onChange({ type: 'step_result', result: event.target.value })}
            />
          )}
        </label>
      )}
      {metadata && (
        <>
          <label className={styles.field}>
            {t({ en: 'Metadata key', fr: 'Clé de métadonnées' })}
            <input
              value={condition.key ?? ''}
              placeholder={t({ en: 'e.g. criteria, todos', fr: 'ex. criteria, todos' })}
              onChange={(event) => onChange({ ...condition, key: event.target.value })}
            />
          </label>
          <label className={styles.field}>
            {t({ en: 'Field', fr: 'Champ' })}
            <input
              value={condition.field ?? ''}
              placeholder={t({ en: 'e.g. status', fr: 'ex. status' })}
              onChange={(event) => onChange({ ...condition, field: event.target.value })}
            />
          </label>
        </>
      )}
      {condition.type === 'metadata_all_match' && (
        <label className={styles.field}>
          {t({ en: 'Value', fr: 'Valeur' })}
          <input
            value={condition.value ?? ''}
            placeholder={t({ en: 'e.g. passed, resolved', fr: 'ex. passed, resolved' })}
            onChange={(event) => onChange({ ...condition, value: event.target.value })}
          />
        </label>
      )}
      {condition.type === 'metadata_all_in' && (
        <label className={styles.field}>
          {t({ en: 'Values (comma-separated)', fr: 'Valeurs (séparées par des virgules)' })}
          <input
            value={condition.values?.join(', ') ?? ''}
            placeholder={t({ en: 'e.g. resolved, dismissed', fr: 'ex. resolved, dismissed' })}
            onChange={(event) =>
              onChange({
                ...condition,
                values: event.target.value
                  .split(',')
                  .map((value) => value.trim())
                  .filter(Boolean),
              })
            }
          />
        </label>
      )}
    </>
  )
}
