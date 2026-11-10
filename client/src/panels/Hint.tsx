import { useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { Info } from 'lucide-react'
import { t } from '../i18n'
import styles from './Panels.module.css'

/** Explains a setting: on hover with a mouse, on tap on a touch screen, where `title` never shows. */
export function Hint({ text }: { text: { en: string; fr: string } }) {
  const [open, setOpen] = useState(false)
  const hover = (next: boolean) => (event: { pointerType: string }) => {
    if (event.pointerType === 'mouse') setOpen(next)
  }
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        className={styles.hint}
        data-testid="setting-hint"
        aria-label={t({ en: 'More information', fr: 'Plus d’informations' })}
        onPointerEnter={hover(true)}
        onPointerLeave={hover(false)}
      >
        <Info size={14} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className={styles.hintBubble}
          data-testid="setting-hint-text"
          side="top"
          align="center"
          sideOffset={6}
          collisionPadding={12}
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          {t(text)}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
