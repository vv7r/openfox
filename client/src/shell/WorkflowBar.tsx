import { continueWorkflow, exitWorkflow } from '../actions'
import { t } from '../i18n'
import { useApp } from '../store/app'
import styles from '../feed/Feed.module.css'

const ACTIVE = new Set(['running', 'waiting', 'blocked', 'paused'])

export function WorkflowBar() {
  const execution = useApp((state) => state.execution)
  if (!execution || !ACTIVE.has(execution.status)) return null
  const color = execution.workflowColor
  return (
    <div className={styles.workflowBar} data-testid="workflow-bar">
      <strong style={color ? { color } : undefined}>{execution.workflowName}</strong>
      {execution.currentStepName && <span>{execution.currentStepName}</span>}
      <div className={styles.barSpacer} />
      {execution.status === 'waiting' &&
        (execution.pendingChoices?.length ? (
          execution.pendingChoices.map((choice) => (
            <button key={choice.id} type="button" onClick={() => continueWorkflow(execution, choice.id)}>
              {choice.label}
            </button>
          ))
        ) : (
          <button type="button" onClick={() => continueWorkflow(execution)}>
            {t({ en: 'Continue', fr: 'Continuer' })}
          </button>
        ))}
      <button type="button" onClick={() => exitWorkflow()}>
        {t({ en: 'Exit', fr: 'Quitter' })}
      </button>
    </div>
  )
}
