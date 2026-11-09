import { useState, type FormEvent } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { t } from '../i18n'
import panelStyles from '../panels/Panels.module.css'
import { allRequiredFilled, collectValues, type ParamRequest } from './launch'
import styles from './Feed.module.css'

export default function ParamsDialog({ request, close }: { request: ParamRequest; close: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({})
  const { parameters } = request
  const ready = allRequiredFilled(parameters, values)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!ready) return
    request.onConfirm(collectValues(parameters, values))
    close()
  }

  return (
    <Dialog.Root open onOpenChange={(open) => !open && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className={panelStyles.overlay} />
        <Dialog.Content
          className={panelStyles.dialog}
          data-size="small"
          data-testid="params-dialog"
          aria-describedby={undefined}
        >
          <div className={panelStyles.header}>
            <Dialog.Title className={panelStyles.title}>
              {`${t({ en: 'Run:', fr: 'Exécuter :' })} ${request.name}`}
            </Dialog.Title>
            <Dialog.Close className={panelStyles.close} aria-label={t({ en: 'Close', fr: 'Fermer' })}>
              <X size={16} />
            </Dialog.Close>
          </div>
          <form className={panelStyles.body} onSubmit={submit}>
            <div className={panelStyles.stack}>
              {parameters.map((parameter, index) => (
                <label key={parameter.id} className={styles.paramField}>
                  <span>
                    {parameter.label || parameter.id}
                    {parameter.required && <span className={styles.paramRequired}>*</span>}
                  </span>
                  {parameter.description && <small>{parameter.description}</small>}
                  <input
                    className={panelStyles.input}
                    autoFocus={index === 0 && !matchMedia('(hover: none)').matches}
                    value={values[parameter.id] ?? ''}
                    onChange={(event) => setValues((list) => ({ ...list, [parameter.id]: event.target.value }))}
                    placeholder={parameter.label || parameter.id}
                  />
                </label>
              ))}
              <div className={panelStyles.row}>
                <span className={panelStyles.grow} />
                <button type="button" onClick={close}>
                  {t({ en: 'Cancel', fr: 'Annuler' })}
                </button>
                <button type="submit" className={panelStyles.primary} disabled={!ready}>
                  {request.confirmLabel}
                </button>
              </div>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
