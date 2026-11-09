import { useState, type ReactNode } from 'react'
import { t } from '../../i18n'
import panelStyles from '../Panels.module.css'
import styles from './Library.module.css'
import type { Destination } from './useLibrary'

export function DestinationField({
  value,
  onChange,
  projectAvailable,
}: {
  value: Destination
  onChange: (value: Destination) => void
  projectAvailable: boolean
}) {
  return (
    <div className={panelStyles.field}>
      <span>{t({ en: 'Save to', fr: 'Enregistrer dans' })}</span>
      <div className={styles.chips}>
        <button type="button" className={styles.chip} aria-pressed={value === 'user'} onClick={() => onChange('user')}>
          {t({ en: 'Global', fr: 'Global' })}
        </button>
        <button
          type="button"
          className={styles.chip}
          aria-pressed={value === 'project'}
          disabled={!projectAvailable}
          onClick={() => onChange('project')}
        >
          {t({ en: 'This project', fr: 'Ce projet' })}
        </button>
      </div>
    </div>
  )
}

export function DeleteButton({ onConfirm }: { onConfirm: () => void }) {
  const [confirming, setConfirming] = useState(false)
  if (!confirming) {
    return (
      <button type="button" data-testid="library-delete" onClick={() => setConfirming(true)}>
        {t({ en: 'Delete', fr: 'Supprimer' })}
      </button>
    )
  }
  return (
    <>
      <button type="button" className={styles.danger} data-testid="library-delete-confirm" onClick={onConfirm}>
        {t({ en: 'Confirm', fr: 'Confirmer' })}
      </button>
      <button type="button" onClick={() => setConfirming(false)}>
        {t({ en: 'Cancel', fr: 'Annuler' })}
      </button>
    </>
  )
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className={panelStyles.eyebrow}>{title}</h3>
      <div className={styles.rows}>{children}</div>
    </section>
  )
}

export function FormActions({
  saving,
  canSave,
  onCancel,
  onSave,
}: {
  saving: boolean
  canSave: boolean
  onCancel: () => void
  onSave: () => void
}) {
  return (
    <div className={panelStyles.row}>
      <span className={panelStyles.grow} />
      <button type="button" onClick={onCancel}>
        {t({ en: 'Cancel', fr: 'Annuler' })}
      </button>
      <button
        type="button"
        className={panelStyles.primary}
        data-testid="library-save"
        disabled={saving || !canSave}
        onClick={onSave}
      >
        {saving ? t({ en: 'Saving…', fr: 'Enregistrement…' }) : t({ en: 'Save', fr: 'Enregistrer' })}
      </button>
    </div>
  )
}
