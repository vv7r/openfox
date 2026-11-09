import { memo, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import type { EditContextRegion } from '@shared/types.js'
import { t } from '../../i18n'
import { useMarkdownHtml } from '../../markdown/cache'
import panelStyles from '../../panels/Panels.module.css'
import { languageFromPath } from './languages'
import { fencedCode, groupSections, readFileStartLine, stripReadNumbers, type Section } from './parse'
import styles from './Tools.module.css'

/** Past this, syntax coloring costs more than it brings. */
const MAX_HIGHLIGHT_CHARS = 60_000

function Highlighted({ code, language }: { code: string; language: string }) {
  const html = useMarkdownHtml(fencedCode(code, language))
  if (html === null) return <pre className={styles.plain}>{code}</pre>
  return <div dangerouslySetInnerHTML={{ __html: html }} />
}

interface CodeProps {
  code: string
  language: string
  startLine?: number
  /** Still growing: skip highlighting, which would redo the whole text on each delta. */
  plain?: boolean
}

export const CodeBlock = memo(function CodeBlock({ code, language, startLine = 1, plain = false }: CodeProps) {
  const highlight = !plain && language !== 'text' && code.length <= MAX_HIGHLIGHT_CHARS
  return (
    <div className={styles.code} style={{ ['--first-line' as string]: startLine - 1 }}>
      {highlight ? (
        <Highlighted code={code} language={language} />
      ) : (
        <pre className={styles.plain}>
          <code>
            {code.split('\n').map((line, index) => (
              <span key={index} className="line">
                {`${line}\n`}
              </span>
            ))}
          </code>
        </pre>
      )}
    </div>
  )
})

export function DiffView({
  oldString,
  newString,
  path,
  streaming = false,
}: {
  oldString: string
  newString: string
  path: string | undefined
  streaming?: boolean
}) {
  const language = languageFromPath(path)
  if (!oldString && !newString) return <p className={styles.note}>{t({ en: 'No changes', fr: 'Aucun changement' })}</p>
  return (
    <div className={styles.frame}>
      {oldString && (
        <div className={styles.removed}>
          <CodeBlock code={oldString} language={language} plain={streaming} />
        </div>
      )}
      {newString && (
        <div className={styles.added}>
          <CodeBlock code={newString} language={language} plain={streaming} />
        </div>
      )}
    </div>
  )
}

export function FilePreview({
  content,
  path,
  streaming = false,
}: {
  content: string
  path: string | undefined
  streaming?: boolean
}) {
  return (
    <div className={`${styles.frame} ${styles.scroll}`}>
      <div className={styles.added}>
        <CodeBlock code={content} language={languageFromPath(path)} plain={streaming} />
      </div>
    </div>
  )
}

function SectionView({ section, language }: { section: Section; language: string }) {
  const block = <CodeBlock code={section.lines.join('\n')} language={language} startLine={section.startLine} />
  if (section.type === 'context') return block
  return <div className={section.type === 'removed' ? styles.removed : styles.added}>{block}</div>
}

export function EditContextView({ regions, path }: { regions: EditContextRegion[]; path: string | undefined }) {
  const language = languageFromPath(path)
  return (
    <>
      {regions.map((region, index) => (
        <div key={index} className={styles.frame}>
          {groupSections(region).map((section, sectionIndex) => (
            <SectionView key={sectionIndex} section={section} language={language} />
          ))}
        </div>
      ))}
    </>
  )
}

export function ImageView({ src, alt, compact = false }: { src: string; alt: string; compact?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        className={styles.imageButton}
        data-compact={compact || undefined}
        onClick={() => setOpen(true)}
      >
        <img src={src} alt={alt} loading="lazy" />
      </button>
      {open && (
        <Dialog.Root open onOpenChange={setOpen}>
          <Dialog.Portal>
            <Dialog.Overlay className={panelStyles.overlay} />
            <Dialog.Content className={styles.lightbox} aria-describedby={undefined}>
              <Dialog.Title className={styles.hidden}>{alt}</Dialog.Title>
              <img src={src} alt={alt} />
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}
    </>
  )
}

export function imageSource(metadata: Record<string, unknown> | undefined): string | undefined {
  const dataUrl = metadata?.['dataUrl']
  if (typeof dataUrl === 'string') return dataUrl
  const mimeType = metadata?.['mimeType']
  const data = metadata?.['base64Data']
  return typeof mimeType === 'string' && mimeType.startsWith('image/') && typeof data === 'string'
    ? `data:${mimeType};base64,${data}`
    : undefined
}

export function readFileCode(result: string, path: string): { code: string; language: string; startLine: number } {
  return { code: stripReadNumbers(result), language: languageFromPath(path), startLine: readFileStartLine(result) }
}
