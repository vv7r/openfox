import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Plus, Trash2, X } from 'lucide-react'
import type { TaskGateConfig } from '@shared/types.js'
import { t } from '../../i18n'
import { generateUUID } from '../../lib/uuid'
import panelStyles from '../Panels.module.css'
import { saveGates } from './boardStore'
import styles from './Tasks.module.css'

interface Props {
  projectId: string
  gates: TaskGateConfig[]
  onClose: () => void
}

export function GatesEditor({ projectId, gates, onClose }: Props) {
  const [local, setLocal] = useState(gates)
  const [saving, setSaving] = useState(false)

  const patch = (index: number, change: Partial<TaskGateConfig>) => {
    setLocal((list) => list.map((gate, position) => (position === index ? { ...gate, ...change } : gate)))
  }

  const add = () => {
    setLocal((list) => [
      ...list,
      { id: `gate_${generateUUID().slice(0, 8)}`, name: '', description: '', required: true, variant: 'done' },
    ])
  }

  const save = async () => {
    setSaving(true)
    await saveGates(
      projectId,
      local.filter((gate) => gate.name.trim()).map((gate) => ({ ...gate, name: gate.name.trim() })),
    )
    setSaving(false)
    onClose()
  }

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className={panelStyles.overlay} />
        <Dialog.Content className={panelStyles.dialog} data-testid="gates-editor" aria-describedby={undefined}>
          <div className={panelStyles.header}>
            <Dialog.Title className={panelStyles.title}>
              {t({ en: 'Definition of Done', fr: 'Définition de Terminé' })}
            </Dialog.Title>
            <Dialog.Close className={panelStyles.close} aria-label={t({ en: 'Close', fr: 'Fermer' })}>
              <X size={16} />
            </Dialog.Close>
          </div>
          <div className={panelStyles.body}>
            <div className={panelStyles.stack}>
              {local.length === 0 && (
                <p className={panelStyles.muted}>
                  {t({
                    en: 'No gates configured: any task can move straight to Done. Add a gate like “all green” (every criterion passes with evidence) or “commit” (work committed with a commit reference).',
                    fr: 'Aucune porte configurée : toute tâche peut passer directement à Terminé. Ajoutez une porte comme « all green » (chaque critère passe avec preuve) ou « commit » (travail validé avec une référence de commit).',
                  })}
                </p>
              )}
              {local.map((gate, index) => (
                <div key={gate.id} className={styles.gate} data-testid="gate-row">
                  <div className={panelStyles.row}>
                    <input
                      className={panelStyles.input}
                      value={gate.name}
                      onChange={(event) => patch(index, { name: event.target.value })}
                      placeholder={t({
                        en: 'Gate name, e.g. “all green” or “commit”',
                        fr: 'Nom de la porte, ex. « all green » ou « commit »',
                      })}
                    />
                    <button
                      type="button"
                      aria-label={t({ en: 'Remove gate', fr: 'Supprimer la porte' })}
                      onClick={() => setLocal((list) => list.filter((_, position) => position !== index))}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <textarea
                    className={`${panelStyles.input} ${styles.gateProof}`}
                    rows={2}
                    value={gate.description}
                    onChange={(event) => patch(index, { description: event.target.value })}
                    placeholder={t({
                      en: 'What counts as acceptable proof?',
                      fr: 'Qu’est-ce qui compte comme preuve acceptable ?',
                    })}
                  />
                  <div className={styles.gateOptions}>
                    <label className={panelStyles.check}>
                      <input
                        type="checkbox"
                        checked={gate.required}
                        onChange={(event) => patch(index, { required: event.target.checked })}
                      />
                      {t({ en: 'Required', fr: 'Requise' })}
                    </label>
                    <label className={panelStyles.check}>
                      <input
                        type="radio"
                        name={`variant-${gate.id}`}
                        checked={gate.variant === 'done'}
                        onChange={() => patch(index, { variant: 'done' })}
                      />
                      {t({ en: 'Blocks Done', fr: 'Bloque Terminé' })}
                    </label>
                    <label className={panelStyles.check}>
                      <input
                        type="radio"
                        name={`variant-${gate.id}`}
                        checked={gate.variant === 'ready'}
                        onChange={() => patch(index, { variant: 'ready' })}
                      />
                      {t({
                        en: 'Definition of ready (blocks In progress)',
                        fr: 'Définition de prêt (bloque En cours)',
                      })}
                    </label>
                  </div>
                </div>
              ))}
              <div className={panelStyles.row}>
                <button type="button" onClick={add}>
                  <Plus size={13} /> {t({ en: 'Add gate', fr: 'Ajouter une porte' })}
                </button>
                <span className={panelStyles.grow} />
                <button type="button" onClick={onClose}>
                  {t({ en: 'Cancel', fr: 'Annuler' })}
                </button>
                <button type="button" className={panelStyles.primary} disabled={saving} onClick={() => void save()}>
                  {t({ en: 'Save gates', fr: 'Enregistrer les portes' })}
                </button>
              </div>
              <p className={panelStyles.muted}>
                {t({
                  en: 'Values are set by you or the agent, each recorded with actor and timestamp.',
                  fr: 'Les valeurs sont définies par vous ou l’agent, chacune enregistrée avec acteur et horodatage.',
                })}
              </p>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
