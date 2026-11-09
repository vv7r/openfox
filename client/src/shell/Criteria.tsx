import { useState } from 'react'
import type { MetadataEntry } from '@shared/types.js'
import { Plus, Trash2, X } from 'lucide-react'
import { saveCriteria } from '../actions'
import { t } from '../i18n'
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

function stepContent(entry: MetadataEntry, index: number): string {
  if (entry.status === 'passed') return '✓'
  if (entry.status === 'failed') return '✗'
  return /^\d{1,2}$/.test(entry.id) ? entry.id : String(index + 1)
}

export function Criteria({ entries }: { entries: MetadataEntry[] }) {
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null)

  const add = () => {
    const description = draft.trim()
    if (!description) return
    saveCriteria([...entries, { id: nextId(entries), description, status: 'pending' }])
    setDraft('')
  }

  const commitEdit = () => {
    if (!editing) return
    const description = editing.text.trim()
    if (description) saveCriteria(entries.map((entry) => (entry.id === editing.id ? { ...entry, description } : entry)))
    setEditing(null)
  }

  return (
    <div data-testid="criteria">
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
            {editing?.id === entry.id ? (
              <input
                className={styles.input}
                autoFocus
                value={editing.text}
                onChange={(event) => setEditing({ id: entry.id, text: event.target.value })}
                onBlur={commitEdit}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') commitEdit()
                  if (event.key === 'Escape') setEditing(null)
                }}
              />
            ) : (
              <button
                type="button"
                className={styles.stepText}
                onClick={() => setEditing({ id: entry.id, text: entry.description })}
              >
                {entry.description}
              </button>
            )}
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
