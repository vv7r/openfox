import { ArrowRight } from 'lucide-react'
import { t } from '../i18n'
import { navigate } from '../router'
import { useApp, type TaskAutoLaunch } from '../store/app'
import styles from './Shell.module.css'

export default function AutoLaunchToast({ launch }: { launch: TaskAutoLaunch }) {
  const dismiss = () => useApp.setState({ autoLaunched: null })
  return (
    <div className={styles.toast} role="status" data-testid="auto-launch-toast">
      <span>
        {t(
          {
            en: '“{{title}}” auto-launched: a slot freed up.',
            fr: '« {{title}} » lancée automatiquement : un emplacement s’est libéré.',
          },
          { title: launch.taskTitle },
        )}
      </span>
      <button
        type="button"
        onClick={() => {
          dismiss()
          navigate(`/p/${launch.projectId}/s/${launch.sessionId}`)
        }}
      >
        {t({ en: 'Open session', fr: 'Ouvrir la session' })} <ArrowRight size={12} />
      </button>
      <button type="button" onClick={dismiss}>
        {t({ en: 'Dismiss', fr: 'Fermer' })}
      </button>
    </div>
  )
}
