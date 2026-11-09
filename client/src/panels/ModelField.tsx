import { useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { ChevronDown } from 'lucide-react'
import feedStyles from '../feed/Feed.module.css'
import { ModelList } from '../feed/ModelList'
import { t } from '../i18n'
import styles from './tasks/Tasks.module.css'

interface Props {
  providerId: string | undefined
  model: string | undefined
  defaultLabel?: string
  onChange: (providerId: string | undefined, model: string | undefined) => void
}

/** Picks a provider's model, or none to fall back to the default. */
export function ModelField({ providerId, model, defaultLabel, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const fallback = defaultLabel ?? t({ en: 'Default model', fr: 'Modèle par défaut' })
  const pick = (nextProvider: string | undefined, nextModel: string | undefined) => {
    setOpen(false)
    onChange(nextProvider, nextModel)
  }
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger type="button" className={styles.modelButton} data-testid="model-field">
        <span className={styles.truncate}>{providerId && model ? model : fallback}</span>
        <ChevronDown size={13} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className={feedStyles.picker} align="start" sideOffset={6}>
          <ModelList
            selected={model}
            onPick={pick}
            before={
              <button type="button" className={feedStyles.pickerItem} onClick={() => pick(undefined, undefined)}>
                {fallback}
              </button>
            }
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
