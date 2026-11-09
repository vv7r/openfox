import { ArrowRight, ChevronDown, ChevronUp } from 'lucide-react'
import { t } from '../../i18n'
import { ConditionFields } from './Conditions'
import type { WorkflowCondition, WorkflowStep } from './types'
import styles from './Workflows.module.css'

interface Props {
  fromLabel: string
  toLabel: string
  condition: WorkflowCondition
  subGroup: string | undefined
  fromStep: WorkflowStep | undefined
  results: string[] | undefined
  index: number
  total: number
  onCondition: (condition: WorkflowCondition) => void
  onSubGroup: (subGroup: string | undefined) => void
  onDelete: () => void
  onMove: (delta: -1 | 1) => void
}

function Warnings({ step, condition, index }: { step: WorkflowStep; condition: WorkflowCondition; index: number }) {
  const sameResult = step.transitions.filter(
    (item) => item.when.type === 'step_result' && item.when.result === condition.result,
  ).length
  const choiceAfter = step.transitions.some((item, position) => position > index && item.when.type === 'step_result')
  const alwaysCount = step.transitions.filter((item) => item.when.type === 'always').length
  return (
    <div className={styles.warnings}>
      <p className={styles.hint}>
        {t({
          en: 'On a user step, each “Step result is…” transition becomes a choice button; “Always” becomes a Continue button.',
          fr: 'Sur une étape utilisateur, chaque transition « Le résultat de l’étape est… » devient un bouton de choix ; « Toujours » devient un bouton Continuer.',
        })}
      </p>
      {condition.type === 'step_result' && sameResult > 1 && (
        <p>
          {t(
            {
              en: 'Duplicate result “{{result}}”: only the first matching transition is reachable.',
              fr: 'Résultat « {{result}} » en double : seule la première transition correspondante est accessible.',
            },
            { result: condition.result ?? '' },
          )}
        </p>
      )}
      {condition.type === 'step_result' && condition.result === 'continue' && (
        <p>
          {t({
            en: '“continue” is reserved for the “Always” Continue button: rename this result.',
            fr: '« continue » est réservé au bouton Continuer de « Toujours » : renommez ce résultat.',
          })}
        </p>
      )}
      {condition.type === 'always' && choiceAfter && (
        <p>
          {t({
            en: 'This “Always” transition comes before choice transitions: those buttons are unreachable.',
            fr: 'Cette transition « Toujours » précède des transitions de choix : ces boutons sont inaccessibles.',
          })}
        </p>
      )}
      {condition.type === 'always' && alwaysCount > 1 && (
        <p>
          {t({
            en: 'Multiple “Always” transitions: only the first is reachable.',
            fr: 'Plusieurs transitions « Toujours » : seule la première est accessible.',
          })}
        </p>
      )}
    </div>
  )
}

export function TransitionPanel(props: Props) {
  const { fromLabel, toLabel, condition, subGroup, fromStep, results, index, total } = props
  return (
    <div className={styles.panel} data-testid="transition-panel">
      <div className={styles.panelHeader}>
        <span className={styles.badge}>{`#${index + 1}`}</span>
        {total > 1 && (
          <>
            <button
              type="button"
              className={styles.iconButton}
              disabled={index === 0}
              aria-label={t({ en: 'Move up (higher priority)', fr: 'Monter (priorité plus élevée)' })}
              onClick={() => props.onMove(-1)}
            >
              <ChevronUp size={12} />
            </button>
            <button
              type="button"
              className={styles.iconButton}
              disabled={index === total - 1}
              aria-label={t({ en: 'Move down (lower priority)', fr: 'Descendre (priorité plus faible)' })}
              onClick={() => props.onMove(1)}
            >
              <ChevronDown size={12} />
            </button>
          </>
        )}
        <span className={styles.spacer} />
        <button type="button" className={styles.linkDanger} data-testid="transition-delete" onClick={props.onDelete}>
          {t({ en: 'Delete', fr: 'Supprimer' })}
        </button>
      </div>
      <div className={styles.route}>
        <strong>{fromLabel}</strong>
        <ArrowRight size={12} />
        <strong>{toLabel}</strong>
      </div>
      <ConditionFields
        label={{ en: 'Condition', fr: 'Condition' }}
        condition={condition}
        results={results}
        onChange={props.onCondition}
      />
      <label className={styles.field}>
        {t({ en: 'Sub-group', fr: 'Sous-groupe' })}
        <input
          value={subGroup ?? ''}
          placeholder={t({ en: 'e.g. build, verify', fr: 'ex. build, verify' })}
          onChange={(event) => props.onSubGroup(event.target.value || undefined)}
        />
      </label>
      {fromStep?.type === 'user' && <Warnings step={fromStep} condition={condition} index={index} />}
      <p className={styles.hint}>
        {t({
          en: 'Drag the handles to reconnect. Order is evaluation priority. Press Delete to remove.',
          fr: 'Faites glisser les poignées pour reconnecter. L’ordre donne la priorité d’évaluation. Appuyez sur Suppr pour retirer.',
        })}
      </p>
    </div>
  )
}
