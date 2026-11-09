import { useState, type FormEvent } from 'react'
import { login } from '../controller'
import { t } from '../i18n'
import styles from './Shell.module.css'

export function Login({ rejected }: { rejected: boolean }) {
  const [password, setPassword] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    void login(password)
  }

  return (
    <form className={styles.login} onSubmit={submit}>
      <span className={styles.wordmark}>{t({ en: 'OpenFox', fr: 'OpenFox' })}</span>
      <input
        className={styles.field}
        type="password"
        autoFocus
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        placeholder={t({ en: 'Password', fr: 'Mot de passe' })}
      />
      {rejected && <span className={styles.error}>{t({ en: 'Wrong password', fr: 'Mot de passe incorrect' })}</span>}
      <button className={styles.primary} type="submit">
        {t({ en: 'Sign in', fr: 'Se connecter' })}
      </button>
    </form>
  )
}
