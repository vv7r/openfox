import { continueGeneration } from '../actions'
import { t } from '../i18n'
import { useApp } from '../store/app'
import styles from './Session.module.css'

export function ChatError() {
  const error = useApp((state) => state.chatError)
  if (!error) return null
  return (
    <div className={styles.chatError} role="alert">
      <span>{error}</span>
      <button type="button" onClick={() => void continueGeneration()}>
        {t({ en: 'Continue', fr: 'Continuer' })}
      </button>
      <button type="button" onClick={() => useApp.setState({ chatError: null })}>
        {t({ en: 'Dismiss', fr: 'Fermer' })}
      </button>
    </div>
  )
}
