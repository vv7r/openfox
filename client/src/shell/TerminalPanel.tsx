import { useEffect, useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { authFetch, getJson, sendJson } from '../api'
import { sendOverSocket, subscribeMessages } from '../controller'
import { t } from '../i18n'
import { useRoute } from '../router'
import { useApp } from '../store/app'
import styles from './Terminal.module.css'

interface TerminalInfo {
  id: string
}

const RESIZE_DEBOUNCE_MS = 100
/** A shell's start-up output has ended once it stays quiet this long. */
const SHELL_SETTLE_MS = 150
const SHELL_START_TIMEOUT_MS = 2000

function XTerm({ id, isNew }: { id: string; isNew: boolean }) {
  const host = useRef<HTMLDivElement>(null)
  const connected = useApp((state) => state.connected)

  useEffect(() => {
    const element = host.current
    if (!element) return
    const css = getComputedStyle(document.documentElement)
    const rgb = (name: string) => `rgb(${css.getPropertyValue(name).trim().split(/\s+/).join(',')})`
    const term = new Terminal({
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: 13,
      cursorBlink: true,
      cursorStyle: 'bar',
      convertEol: true,
      theme: {
        background: rgb('--color-primary'),
        foreground: rgb('--color-text-primary'),
        cursor: rgb('--color-accent-primary'),
      },
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(element)
    fit.fit()

    // A size sent while a new shell is still starting makes it print its prompt twice
    let shellReady = !isNew
    const sendSize = () => sendOverSocket('terminal.resize', { sessionId: id, cols: term.cols, rows: term.rows })
    const markReady = () => {
      if (shellReady) return
      shellReady = true
      sendSize()
    }
    if (shellReady) sendSize()
    let settle: ReturnType<typeof setTimeout> | undefined = setTimeout(markReady, SHELL_START_TIMEOUT_MS)

    term.onData((data) => sendOverSocket('terminal.write', { sessionId: id, data }))
    const unsubscribe = subscribeMessages((message) => {
      const payload = message.payload as { sessionId?: string; data?: string } | undefined
      if ((message.type as string) !== 'terminal.output' || payload?.sessionId !== id || !payload.data) return
      term.write(payload.data)
      if (shellReady) return
      clearTimeout(settle)
      settle = setTimeout(markReady, SHELL_SETTLE_MS)
    })

    let timer: ReturnType<typeof setTimeout> | undefined
    const observer = new ResizeObserver(() => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        if (element.clientWidth === 0) return
        fit.fit()
        if (shellReady) sendSize()
      }, RESIZE_DEBOUNCE_MS)
    })
    observer.observe(element)

    return () => {
      clearTimeout(timer)
      clearTimeout(settle)
      observer.disconnect()
      unsubscribe()
      term.dispose()
    }
  }, [id, isNew])

  // A new socket starts with no subscriptions, so this follows every reconnect
  useEffect(() => {
    if (connected) sendOverSocket('terminal.subscribe', { sessionId: id })
  }, [connected, id])

  return <div ref={host} className={styles.host} data-testid="terminal" />
}

export default function TerminalPanel() {
  const { projectId } = useRoute()
  const workdir = useApp((state) => state.session?.workspace ?? state.session?.workdir)
  const [terminals, setTerminals] = useState<TerminalInfo[] | null>(null)
  const [active, setActive] = useState<string | null>(null)
  const justCreated = useRef<string | null>(null)

  const create = () => {
    void sendJson('/api/terminals', 'POST', { workdir, projectId })
      .then((response) => response.json() as Promise<TerminalInfo>)
      .then((created) => {
        justCreated.current = created.id
        setTerminals((list) => [...(list ?? []), created])
        setActive(created.id)
      })
  }

  useEffect(() => {
    let cancelled = false
    void getJson<{ sessions?: TerminalInfo[] } | TerminalInfo[]>(
      `/api/terminals?projectId=${encodeURIComponent(projectId ?? '')}`,
    ).then((data) => {
      if (cancelled) return
      const list = Array.isArray(data) ? data : (data.sessions ?? [])
      setTerminals(list)
      setActive(list[0]?.id ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [projectId])

  const close = (id: string) => {
    void authFetch(`/api/terminals/${id}`, { method: 'DELETE' })
    const remaining = (terminals ?? []).filter((terminal) => terminal.id !== id)
    setTerminals(remaining)
    if (active === id) setActive(remaining[0]?.id ?? null)
  }

  return (
    <div className={styles.panel}>
      <div className={styles.tabs}>
        {terminals?.map((terminal, index) => (
          <span key={terminal.id} className={styles.tab} data-active={terminal.id === active || undefined}>
            <button type="button" onClick={() => setActive(terminal.id)}>
              {`${index + 1}`}
            </button>
            <button
              type="button"
              aria-label={t({ en: 'Close terminal', fr: 'Fermer le terminal' })}
              onClick={() => close(terminal.id)}
            >
              <X size={11} />
            </button>
          </span>
        ))}
        <button
          type="button"
          className={styles.add}
          data-testid="terminal-new"
          aria-label={t({ en: 'New terminal', fr: 'Nouveau terminal' })}
          onClick={create}
        >
          <Plus size={13} />
        </button>
      </div>
      {active ? (
        <XTerm key={active} id={active} isNew={justCreated.current === active} />
      ) : (
        terminals && <p className={styles.empty}>{t({ en: 'No terminal open', fr: 'Aucun terminal ouvert' })}</p>
      )}
    </div>
  )
}
