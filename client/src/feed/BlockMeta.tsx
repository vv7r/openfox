import { Copy } from 'lucide-react'
import { t } from '../i18n'
import { copyToClipboard } from '../lib/clipboard'
import { useApp } from '../store/app'
import styles from './Feed.module.css'

export function CopyButton({ text, className }: { text: string; className?: string | undefined }) {
  const label = t({ en: 'Copy', fr: 'Copier' })
  return (
    <button
      type="button"
      className={className ?? styles.copyButton}
      data-testid="copy-block"
      aria-label={label}
      title={label}
      onClick={() => void copyToClipboard(text)}
    >
      <Copy size={12} />
    </button>
  )
}

/** The message time, shown only when the header clock toggle is on. */
export function Stamp({ timestamp }: { timestamp: string | undefined }) {
  const show = useApp((state) => state.display['display.showTimestamps'] === 'true')
  if (!show || !timestamp) return null
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return null
  return (
    <time className={styles.stamp} dateTime={timestamp} title={date.toLocaleString()}>
      {date.toLocaleTimeString()}
    </time>
  )
}
