import { useEffect, useState } from 'react'
import { continueGeneration, retryAfterFailure, retryLlmNow } from '../actions'
import { t } from '../i18n'
import { navigate } from '../router'
import { useApp, type LlmRetry } from '../store/app'
import styles from './Session.module.css'
import shellStyles from './Shell.module.css'

function RetryCountdown({ retry }: { retry: Extract<LlmRetry, { status: 'retrying' }> }) {
  const [start] = useState(() => Date.now())
  const [now, setNow] = useState(start)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(timer)
  }, [])
  const count = Math.max(0, Math.ceil((retry.retryInMs - (now - start)) / 1000))
  return (
    <span title={retry.error}>
      {t(
        {
          en: 'LLM call failed, retrying (attempt {{attempt}})',
          fr: 'Appel LLM échoué, nouvelle tentative (essai {{attempt}})',
        },
        { attempt: retry.attempt },
      )}
      {count > 0 && t({ en: ', next try in {{count}}s', fr: ', prochain essai dans {{count}} s' }, { count })}
    </span>
  )
}

function LlmRetryBanner() {
  const retry = useApp((state) => state.llmRetry)
  const running = useApp((state) => state.session?.isRunning === true)
  const execution = useApp((state) => state.execution)
  const blocked = execution?.status === 'blocked' && Boolean(execution.currentStepId) && !running
  const failed = retry?.status === 'failed' && !running

  if (retry?.status === 'retrying' && running) {
    return (
      <div className={styles.chatRetry} role="status" data-testid="llm-retry-indicator">
        <RetryCountdown key={retry.attempt} retry={retry} />
        <button type="button" onClick={retryLlmNow}>
          {t({ en: 'Retry now', fr: 'Réessayer maintenant' })}
        </button>
      </div>
    )
  }
  if (!failed && !blocked) return null
  const step = execution?.currentStepName
  return (
    <div className={styles.chatError} role="alert" data-testid="llm-retry-failed">
      <span>
        {failed
          ? t({ en: 'The LLM call failed: {{error}}', fr: 'L’appel LLM a échoué : {{error}}' }, { error: retry.error })
          : step
            ? t(
                {
                  en: 'The "{{step}}" step stopped before finishing, retry to continue.',
                  fr: 'L’étape « {{step}} » s’est arrêtée avant la fin, réessayez pour continuer.',
                },
                { step },
              )
            : t({
                en: 'This workflow step stopped before finishing, retry to continue.',
                fr: 'Cette étape du workflow s’est arrêtée avant la fin, réessayez pour continuer.',
              })}
      </span>
      <button type="button" onClick={retryAfterFailure}>
        {failed ? t({ en: 'Retry', fr: 'Réessayer' }) : t({ en: 'Retry step', fr: 'Réessayer l’étape' })}
      </button>
    </div>
  )
}

/** A session in the background is blocked on the user: one click takes them there. */
export function ConfirmationsElsewhere({ projectId }: { projectId: string }) {
  const sessionId = useApp((state) => Object.keys(state.confirmationsElsewhere)[0])
  const count = useApp((state) => (sessionId ? (state.confirmationsElsewhere[sessionId]?.length ?? 0) : 0))
  const title = useApp((state) => state.sessions.find((s) => s.id === sessionId)?.title)
  if (!sessionId) return null
  return (
    <button
      type="button"
      className={shellStyles.elsewhereBanner}
      data-testid="confirmations-elsewhere"
      onClick={() => navigate(`/p/${projectId}/s/${sessionId}`)}
    >
      <span>
        {t(
          {
            en: '{{count}} confirmation(s) pending in session "{{title}}"',
            fr: '{{count}} confirmation(s) en attente dans la session « {{title}} »',
          },
          { count, title: title ?? sessionId.slice(0, 6) },
        )}
      </span>
      <span>{t({ en: 'View session', fr: 'Voir la session' })}</span>
    </button>
  )
}

export function ChatError() {
  const error = useApp((state) => state.chatError)
  return (
    <>
      <LlmRetryBanner />
      {error && (
        <div className={styles.chatError} role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => void continueGeneration()}>
            {t({ en: 'Continue', fr: 'Continuer' })}
          </button>
          <button type="button" onClick={() => useApp.setState({ chatError: null })}>
            {t({ en: 'Dismiss', fr: 'Fermer' })}
          </button>
        </div>
      )}
    </>
  )
}
