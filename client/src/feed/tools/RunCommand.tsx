import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { t } from '../../i18n'
import type { ToolStatus } from '../../lib/toolStatus'
import { parseAnsi, type AnsiSegment } from './parse'
import styles from './Tools.module.css'

const MAX_SHOWN_CHARS = 40_000
const DEFAULT_TIMEOUT_MS = 120_000
const STICK_THRESHOLD_PX = 24

const ANSI_COLORS: Record<number, string> = {
  31: 'accent-error',
  32: 'accent-success',
  33: 'accent-warning',
  34: 'accent-info',
  35: 'text-thinking',
  36: 'accent-info',
  37: 'text-primary',
  90: 'text-muted',
  91: 'accent-error',
  92: 'accent-success',
  93: 'accent-warning',
  94: 'accent-info',
  95: 'text-thinking',
  96: 'accent-info',
  97: 'text-primary',
}

const tone = (code: number | undefined, opacity = 1): string | undefined => {
  if (code === undefined) return undefined
  // Backgrounds are the matching foreground plus ten
  const name = ANSI_COLORS[(code >= 40 && code <= 47) || code >= 100 ? code - 10 : code]
  return name ? `rgb(var(--color-${name}) / ${opacity})` : undefined
}

function segmentStyle(segment: AnsiSegment): CSSProperties {
  return {
    color: tone(segment.color),
    backgroundColor: tone(segment.background, 0.3),
    fontWeight: segment.bold ? 600 : undefined,
    opacity: segment.dim ? 0.7 : undefined,
    fontStyle: segment.italic ? 'italic' : undefined,
    textDecoration: segment.underline ? 'underline' : undefined,
  } as CSSProperties
}

const Ansi = memo(function Ansi({ text, className }: { text: string; className?: string }) {
  const segments = useMemo(() => parseAnsi(text), [text])
  return (
    <span className={className}>
      {segments.map((segment, index) => (
        <span key={index} style={segmentStyle(segment)}>
          {segment.text}
        </span>
      ))}
    </span>
  )
})

/** The chunks that fit the budget, newest last; finished ones never re-render. */
function tailChunks<T extends { content: string }>(chunks: T[]): Array<{ chunk: T; index: number }> {
  const kept: Array<{ chunk: T; index: number }> = []
  let total = 0
  for (let index = chunks.length - 1; index >= 0 && total < MAX_SHOWN_CHARS; index--) {
    kept.unshift({ chunk: chunks[index]!, index })
    total += chunks[index]!.content.length
  }
  return kept
}

interface Props {
  command: string
  timeoutMs: number | undefined
  startedAt: number | undefined
  chunks: Array<{ stream: 'stdout' | 'stderr'; content: string }> | undefined
  status: ToolStatus
  result: string | undefined
  durationMs: number | undefined
}

export function RunCommand({ command, timeoutMs, startedAt, chunks, status, result, durationMs }: Props) {
  const timeout = timeoutMs ?? DEFAULT_TIMEOUT_MS
  const pending = status === 'pending'
  const [elapsed, setElapsed] = useState(() => (startedAt ? Date.now() - startedAt : 0))
  const output = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)

  useEffect(() => {
    if (!pending || !startedAt) return
    // Once a second: the bar below moves on its own, in CSS, so nothing re-renders for it
    const timer = setInterval(() => setElapsed(Date.now() - startedAt), 1000)
    return () => clearInterval(timer)
  }, [pending, startedAt])

  const size = chunks?.length ?? 0
  useLayoutEffect(() => {
    const element = output.current
    if (element && pinned.current) element.scrollTop = element.scrollHeight
  }, [size, status])

  const seconds = (pending ? elapsed : (durationMs ?? 0)) / 1000
  const finalText = result && result.length > MAX_SHOWN_CHARS ? result.slice(-MAX_SHOWN_CHARS) : result

  return (
    <div className={styles.stack} data-testid="run-command">
      <div className={styles.commandRow}>
        <code className={styles.command}>{`$ ${command}`}</code>
        <span className={styles.commandMeta}>
          {pending && <span className={styles.running}>{t({ en: 'running', fr: 'en cours' })}</span>}
          {status === 'interrupted' && (
            <span className={styles.interrupted}>{t({ en: 'interrupted', fr: 'interrompu' })}</span>
          )}
          {`${seconds.toFixed(pending ? 0 : 1)}s / ${timeout / 1000}s`}
        </span>
      </div>
      {pending && (
        <div className={styles.progress}>
          <div
            style={{
              animationDuration: `${timeout}ms`,
              animationDelay: startedAt ? `-${Date.now() - startedAt}ms` : undefined,
            }}
          />
        </div>
      )}
      {((pending && size > 0) || finalText) && (
        <div
          ref={output}
          className={styles.output}
          data-pending={pending || undefined}
          onScroll={(event) => {
            const element = event.currentTarget
            pinned.current = element.scrollHeight - element.scrollTop - element.clientHeight < STICK_THRESHOLD_PX
          }}
        >
          {pending && chunks
            ? tailChunks(chunks).map(({ chunk, index }) => (
                <Ansi
                  key={index}
                  text={chunk.content}
                  {...(chunk.stream === 'stderr' ? { className: styles.stderr } : {})}
                />
              ))
            : finalText && <Ansi text={finalText} />}
        </div>
      )}
    </div>
  )
}
