import { useEffect, useRef } from 'react'
import { t } from '../i18n'
import { useWorkspace, type FileBody, type Tab } from '../store/workspace'
import { mountDiff, mountFile } from './monaco'
import styles from './Shell.module.css'

function Editor({ body }: { body: FileBody }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = host.current
    if (!element) return
    if ('content' in body) return mountFile(element, body.path, body.content)
    if ('original' in body) return mountDiff(element, body.path, body.original, body.modified)
  }, [body])

  return <div ref={host} className={styles.editor} data-testid="code-view" />
}

export default function CodeView({ tab }: { tab: Tab }) {
  const content = useWorkspace((state) => state.contents[tab.key])
  if (!content || content.status === 'loading') return null
  if (content.status === 'error') {
    return (
      <p className={styles.empty}>
        {t({ en: 'This file cannot be shown', fr: 'Ce fichier ne peut pas être affiché' })}
      </p>
    )
  }
  if ('binary' in content.body) return <p className={styles.empty}>{t({ en: 'Binary file', fr: 'Fichier binaire' })}</p>
  if ('tooLarge' in content.body) {
    return (
      <p className={styles.empty}>
        {t({ en: 'File too large to show', fr: 'Fichier trop volumineux pour être affiché' })}
      </p>
    )
  }
  return <Editor body={content.body} />
}
