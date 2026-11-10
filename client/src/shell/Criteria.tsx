import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import type { MetadataEntry } from '@shared/types.js'
import { Plus, Trash2, X } from 'lucide-react'
import { saveCriteria } from '../actions'
import { t } from '../i18n'
import panelStyles from '../panels/Panels.module.css'
import styles from './Session.module.css'

const STATUS_CYCLE: Record<string, string> = {
  pending: 'completed',
  completed: 'passed',
  passed: 'failed',
  failed: 'pending',
}

function nextId(entries: MetadataEntry[]): string {
  const numbers = entries.map((entry) => Number(entry.id)).filter((id) => Number.isInteger(id) && id >= 0)
  return String(Math.max(-1, ...numbers) + 1)
}

const stepNumber = (entry: MetadataEntry, index: number): string =>
  /^\d{1,2}$/.test(entry.id) ? entry.id : String(index + 1)

function stepContent(entry: MetadataEntry, index: number): string {
  if (entry.status === 'passed') return '✓'
  if (entry.status === 'failed') return '✗'
  return stepNumber(entry, index)
}

function statusLabel(status: string): string {
  if (status === 'passed') return t({ en: 'Validated', fr: 'Validé' })
  if (status === 'failed') return t({ en: 'Failed', fr: 'Échoué' })
  if (status === 'completed') return t({ en: 'Done, awaiting verification', fr: 'Terminé, en attente de vérification' })
  return t({ en: 'Pending', fr: 'En attente' })
}

function CriterionDialog({
  entry,
  number,
  onSave,
  close,
}: {
  entry: MetadataEntry
  number: string
  onSave: (description: string) => void
  close: () => void
}) {
  const [text, setText] = useState<string | null>(null)
  const trimmed = text?.trim()

  return (
    <Dialog.Root open onOpenChange={(open) => !open && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className={panelStyles.overlay} />
        <Dialog.Content
          className={panelStyles.dialog}
          data-size="medium"
          data-testid="criterion-dialog"
          aria-describedby={undefined}
        >
          <div className={panelStyles.header}>
            <Dialog.Title
              className={panelStyles.title}
            >{`${t({ en: 'Criterion', fr: 'Critère' })} ${number}`}</Dialog.Title>
            <Dialog.Close className={panelStyles.close} aria-label={t({ en: 'Close', fr: 'Fermer' })}>
              <X size={16} />
            </Dialog.Close>
          </div>
          <div className={panelStyles.body}>
            <div className={panelStyles.stack}>
              <span className={styles.criterionStatus} data-status={entry.status} data-testid="criterion-status">
                {statusLabel(entry.status)}
              </span>
              {text === null ? (
                <p className={styles.criterionText} data-testid="criterion-full">
                  {entry.description}
                </p>
              ) : (
                <textarea
                  className={panelStyles.textarea}
                  data-testid="criterion-edit"
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                />
              )}
              <div className={panelStyles.row}>
                <span className={panelStyles.grow} />
                {text === null ? (
                  <button type="button" data-testid="criterion-modify" onClick={() => setText(entry.description)}>
                    {t({ en: 'Edit', fr: 'Modifier' })}
                  </button>
                ) : (
                  <>
                    <button type="button" onClick={() => setText(null)}>
                      {t({ en: 'Cancel', fr: 'Annuler' })}
                    </button>
                    <button
                      type="button"
                      className={panelStyles.primary}
                      data-testid="criterion-save"
                      disabled={!trimmed}
                      onClick={() => {
                        if (trimmed) onSave(trimmed)
                        setText(null)
                      }}
                    >
                      {t({ en: 'Save', fr: 'Enregistrer' })}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export function Criteria({ entries }: { entries: MetadataEntry[] }) {
  const [draft, setDraft] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const openIndex = entries.findIndex((entry) => entry.id === openId)
  const opened = entries[openIndex]

  const add = () => {
    const description = draft.trim()
    if (!description) return
    saveCriteria([...entries, { id: nextId(entries), description, status: 'pending' }])
    setDraft('')
  }

  return (
    <div data-testid="criteria">
      {opened && (
        <CriterionDialog
          key={opened.id}
          entry={opened}
          number={stepNumber(opened, openIndex)}
          onSave={(description) =>
            saveCriteria(entries.map((entry) => (entry.id === opened.id ? { ...entry, description } : entry)))
          }
          close={() => setOpenId(null)}
        />
      )}
      <ol className={styles.timeline}>
        {entries.map((entry, index) => (
          <li key={entry.id}>
            <button
              type="button"
              className={styles.step}
              data-status={entry.status}
              title={t(
                { en: 'Status: {{status}} (click to change)', fr: 'Statut : {{status}} (cliquez pour changer)' },
                { status: entry.status },
              )}
              onClick={() =>
                saveCriteria(
                  entries.map((e) => (e.id === entry.id ? { ...e, status: STATUS_CYCLE[e.status] ?? 'pending' } : e)),
                )
              }
            >
              {stepContent(entry, index)}
            </button>
            <button
              type="button"
              className={styles.stepText}
              data-testid="criterion-text"
              onClick={() => setOpenId(entry.id)}
            >
              {/* Safari ignores line-clamp on a button itself */}
              <span className={styles.stepClamp}>{entry.description}</span>
            </button>
            <button
              type="button"
              className={styles.ghost}
              aria-label={t({ en: 'Delete criterion', fr: 'Supprimer le critère' })}
              onClick={() => saveCriteria(entries.filter((e) => e.id !== entry.id))}
            >
              <X size={13} />
            </button>
          </li>
        ))}
      </ol>
      <div className={styles.addRow}>
        <input
          className={styles.input}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') add()
          }}
          placeholder={t({ en: 'New criterion…', fr: 'Nouveau critère…' })}
        />
        <button
          type="button"
          className={styles.ghost}
          aria-label={t({ en: 'Add criterion', fr: 'Ajouter un critère' })}
          onClick={add}
        >
          <Plus size={14} />
        </button>
        {entries.length > 0 && (
          <button
            type="button"
            className={styles.ghost}
            aria-label={t({ en: 'Clear all criteria', fr: 'Effacer tous les critères' })}
            onClick={() => saveCriteria([])}
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  )
}
