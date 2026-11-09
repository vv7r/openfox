import { lazy, Suspense, useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { EllipsisVertical } from 'lucide-react'
import { t } from '../i18n'
import type { MoreMenuProps } from './MoreMenu'
import styles from './Feed.module.css'

const MoreMenu = lazy(() => import('./MoreMenu'))

export function MoreButton(props: Omit<MoreMenuProps, 'close'>) {
  const [open, setOpen] = useState(false)
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        className={styles.more}
        data-testid="composer-more"
        aria-label={t({ en: 'More options', fr: 'Plus d’options' })}
        title={t({ en: 'More options', fr: 'Plus d’options' })}
      >
        <EllipsisVertical size={16} />
      </Popover.Trigger>
      <Popover.Portal>
        {/* The search field takes focus itself, except where that would open a phone keyboard */}
        <Popover.Content
          className={styles.picker}
          align="end"
          side="top"
          sideOffset={6}
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <Suspense fallback={null}>
            <MoreMenu {...props} close={() => setOpen(false)} />
          </Suspense>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
