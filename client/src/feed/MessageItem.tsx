import { lazy, memo, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Copy, GitFork, Pencil, RotateCcw } from 'lucide-react'
import type { Message } from '@shared/types.js'
import { forkAt, replayMessage } from '../actions'
import { t } from '../i18n'
import { copyToClipboard } from '../lib/clipboard'
import { formatTenths, formatTime } from '../lib/format-stats'
import { PluginActions, usePluginContext } from '../plugins/Slots'
import { scanBlocks } from '../markdown/blocks'
import { useMarkdownHtml } from '../markdown/cache'
import { useApp } from '../store/app'
import { useFeed } from '../store/feed'
import { CopyButton, Stamp } from './BlockMeta'
import { toElements } from './elements'
import type { FeedItem } from './items'
import { stopThinking, thinkingDuration, thinkingSeconds } from './thinkingClock'
import { CriteriaCard, PreparingCard, ToolCard } from './ToolCard'
import { readableReminder } from './systemText'
import styles from './Feed.module.css'

const MessageAttachments = lazy(() => import('./MessageAttachments'))

// The virtualized feed drops blocks scrolled out of view: what was folded must survive that
const foldedCode = new Set<string>()

function useCodeFolding(source: string, html: string | null) {
  const host = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const element = host.current
    if (!element || !html?.includes('<details')) return
    const keyOf = (details: Element) =>
      `${[...element.querySelectorAll('details')].indexOf(details as HTMLDetailsElement)}:${source}`
    element.querySelectorAll('details').forEach((details) => {
      if (foldedCode.has(keyOf(details))) details.open = false
    })
    // toggle does not bubble, but it can be captured
    const onToggle = (event: Event) => {
      const details = event.target as HTMLDetailsElement
      if (details.open) foldedCode.delete(keyOf(details))
      else foldedCode.add(keyOf(details))
    }
    element.addEventListener('toggle', onToggle, true)
    // Copy button in each code block header (the HTML comes from the markdown worker)
    element.querySelectorAll('details > summary').forEach((summary) => {
      if (summary.querySelector('button')) return
      const button = document.createElement('button')
      button.type = 'button'
      button.className = styles.codeCopy!
      button.title = t({ en: 'Copy', fr: 'Copier' })
      button.setAttribute('aria-label', button.title)
      summary.append(button)
    })
    const onClick = (event: MouseEvent) => {
      const button = (event.target as Element).closest(`button.${styles.codeCopy}`)
      if (!button) return
      event.preventDefault() // a click in <summary> would fold the block
      const code = button.closest('details')?.querySelector('pre')?.textContent ?? ''
      void copyToClipboard(code).then(() => {
        button.setAttribute('data-copied', '')
        setTimeout(() => button.removeAttribute('data-copied'), 1500)
      })
    }
    element.addEventListener('click', onClick)
    return () => {
      element.removeEventListener('toggle', onToggle, true)
      element.removeEventListener('click', onClick)
    }
  }, [source, html])
  return host
}

const Block = memo(function Block({ source }: { source: string }) {
  const html = useMarkdownHtml(source)
  const host = useCodeFolding(source, html)
  if (html === null) return <div className={styles.pending}>{source}</div>
  return <div ref={host} className={styles.block} dangerouslySetInnerHTML={{ __html: html }} />
})

/** Finished blocks never re-render; only the open tail changes on each frame. */
export function Markdown({ text, streaming }: { text: string; streaming: boolean }) {
  const scan = useRef({ offset: 0, blocks: [] as string[], length: 0 })
  if (text.length < scan.current.length) scan.current = { offset: 0, blocks: [], length: 0 }
  const found = scanBlocks(text, scan.current.offset)
  if (found.blocks.length > 0) {
    scan.current = { offset: found.offset, blocks: [...scan.current.blocks, ...found.blocks], length: text.length }
  } else {
    scan.current.length = text.length
  }

  const tail = text.slice(scan.current.offset).trim()
  return (
    <>
      {scan.current.blocks.map((block, index) => (
        <Block key={index} source={block} />
      ))}
      {tail && (streaming ? <div className={styles.tail}>{tail}</div> : <Block source={tail} />)}
    </>
  )
}

// One decimal on screen: tick every tenth of a second (only this span re-renders)
const THINKING_TICK_MS = 100

/** Ticks on its own so that a running clock never re-renders the message. */
function ThinkingClock({ messageId }: { messageId: string }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), THINKING_TICK_MS)
    return () => clearInterval(timer)
  }, [])
  return (
    <span data-testid="thinking-clock">
      {t(
        { en: 'Thinking… ({{time}})', fr: 'Réflexion… ({{time}})' },
        { time: formatTenths(thinkingSeconds(messageId, now)) },
      )}
    </span>
  )
}

function Thinking({
  messageId,
  text,
  active,
  duration,
}: {
  messageId: string
  text: string
  active: boolean
  duration: number | undefined
}) {
  const [open, setOpen] = useState(useApp.getState().display['display.showThinking'] === 'true')
  useEffect(() => {
    if (!active) stopThinking(messageId, Date.now())
  }, [active, messageId])
  // The server's figure arrives with the message stats; until then (or without it) keep the clock's
  const seconds = duration ?? (active ? undefined : thinkingDuration(messageId))
  const label = active ? (
    <ThinkingClock messageId={messageId} />
  ) : seconds !== undefined ? (
    t({ en: 'Thought for {{time}}', fr: 'A réfléchi pendant {{time}}' }, { time: formatTenths(seconds) })
  ) : (
    t({ en: 'Thought', fr: 'A réfléchi' })
  )
  return (
    <div className={styles.thinking}>
      <button type="button" onClick={() => setOpen(!open)}>
        {label}
      </button>
      {open && <CopyButton text={text} />}
      {open && <div className={styles.thinkingText}>{text}</div>}
    </div>
  )
}

const shortNumber = (value: number) => (value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value.toFixed(0))

function Stats({ stats }: { stats: NonNullable<Message['stats']> }) {
  if ('error' in stats) return null
  const model = stats.model.split('/').pop() ?? stats.model
  return (
    <button
      type="button"
      className={styles.stats}
      data-testid="message-stats"
      onClick={() => useApp.setState({ agentDialog: { kind: 'turn-stats', stats } })}
    >
      <span>{stats.reasoningEffort ? `${model}:${stats.reasoningEffort}` : model}</span>
      <span>{stats.mode}</span>
      <span>{formatTime(stats.totalTime)}</span>
      <span>{`${shortNumber(stats.prefillTokens)} @ ${shortNumber(stats.prefillSpeed)} pp`}</span>
      <span>{`${shortNumber(stats.generationTokens)} @ ${shortNumber(stats.generationSpeed)} tg`}</span>
    </button>
  )
}

function Assistant({ message }: { message: Message }) {
  const { thinking, elements } = toElements(message)
  const showStats = useApp((state) => state.display['display.showStats'] !== 'false')
  const streaming = message.isStreaming === true
  return (
    <div className={styles.messageBlock}>
      <Stamp timestamp={message.timestamp} />
      {message.content.trim() && !streaming && <CopyButton className={styles.blockCopy} text={message.content} />}
      {thinking && (
        <Thinking
          messageId={message.id}
          text={thinking}
          active={streaming && elements.length === 0}
          duration={message.stats?.thinkingDuration}
        />
      )}
      {elements.map((element, index) => {
        if (element.type === 'text') return <Markdown key={index} text={element.content} streaming={streaming} />
        if (element.type === 'criteria') {
          return <CriteriaCard key={index} calls={element.calls} preparing={element.preparing} />
        }
        if (element.type === 'preparing')
          return <PreparingCard key={`p${element.preparing.index}`} preparing={element.preparing} />
        return <ToolCard key={element.call.id} call={element.call} />
      })}
      {showStats && message.stats && <Stats stats={message.stats} />}
      <MessagePluginActions messageId={message.id} />
      {message.partial && <div className={styles.notice}>{t({ en: 'Aborted', fr: 'Interrompu' })}</div>}
      {message.completeReason === 'truncated' && (
        <div className={styles.notice}>
          {t({
            en: 'Response was truncated: the model ran out of output tokens.',
            fr: 'Réponse tronquée : le modèle a épuisé ses jetons de sortie.',
          })}
        </div>
      )}
    </div>
  )
}

function AutoPrompt({ message }: { message: Message }) {
  const [open, setOpen] = useState(false)
  const metadata = message.metadata
  const kind =
    metadata?.kind === 'reminder' ? t({ en: 'reminder', fr: 'rappel' }) : t({ en: 'instructions', fr: 'instructions' })
  return (
    <div className={styles.autoPrompt}>
      <Stamp timestamp={message.timestamp} />
      <button type="button" onClick={() => setOpen(!open)}>
        <span className={styles.autoPromptDot} style={{ background: metadata?.color ?? 'currentColor' }} />
        <span>{`${metadata?.name ?? t({ en: 'Agent', fr: 'Agent' })} · ${kind}`}</span>
      </button>
      <CopyButton text={readableReminder(message.content)} />
      {open && (
        <div className={styles.autoPromptBody}>
          <Markdown text={readableReminder(message.content)} streaming={false} />
        </div>
      )}
    </div>
  )
}

function parseCard<T>(content: string): T | null {
  try {
    return JSON.parse(content) as T
  } catch {
    return null
  }
}

function Other({ message }: { message: Message }) {
  const definitions = useApp((state) => state.display['display.showAgentDefinitions'] !== 'false')
  const workflowBars = useApp((state) => state.display['display.showWorkflowBars'] !== 'false')
  if (message.messageKind === 'auto-prompt' && message.isSystemGenerated)
    return definitions ? <AutoPrompt message={message} /> : null
  if (!workflowBars && (message.messageKind === 'workflow-started' || message.messageKind === 'task-completed'))
    return null
  if (message.messageKind === 'context-reset') return <div className={styles.divider}>{message.content}</div>
  if (message.messageKind === 'workflow-started') {
    const card = parseCard<{ workflowName: string }>(message.content)
    if (card)
      return (
        <div className={styles.divider}>
          {t({ en: 'Workflow started: {{name}}', fr: 'Workflow lancé : {{name}}' }, { name: card.workflowName })}
        </div>
      )
  }
  if (message.messageKind === 'task-completed') {
    const card = parseCard<{ summary?: string }>(message.content)
    if (card)
      return <div className={styles.divider}>{card.summary ?? t({ en: 'Task completed', fr: 'Tâche terminée' })}</div>
  }
  if (message.role === 'system')
    return (
      <div className={styles.messageBlock}>
        <Stamp timestamp={message.timestamp} />
        <CopyButton className={styles.blockCopy} text={message.content} />
        <div className={styles.system}>{message.content}</div>
      </div>
    )
  if (message.isSystemGenerated) {
    const text = readableReminder(message.content)
    return (
      <div className={styles.messageBlock}>
        <Stamp timestamp={message.timestamp} />
        <CopyButton className={styles.blockCopy} text={text} />
        <div className={styles.user} data-system>
          {text}
        </div>
      </div>
    )
  }
  return <UserMessage message={message} />
}

function MessagePluginActions({ messageId }: { messageId: string }) {
  const base = usePluginContext()
  const context = useMemo(() => ({ ...base, messageId }), [base, messageId])
  return <PluginActions slot="message.actions" context={context} />
}

function UserMessage({ message }: { message: Message }) {
  const [draft, setDraft] = useState<string | null>(null)

  if (draft !== null) {
    return (
      <div className={styles.editor}>
        <textarea autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} />
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primaryAction}
            onClick={() => {
              setDraft(null)
              void replayMessage(message.id, draft)
            }}
          >
            {t({ en: 'Save and resend', fr: 'Enregistrer et renvoyer' })}
          </button>
          <button type="button" onClick={() => setDraft(null)}>
            {t({ en: 'Cancel', fr: 'Annuler' })}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.userRow}>
      <Stamp timestamp={message.timestamp} />
      <div className={styles.messageActions}>
        <button
          type="button"
          title={t({ en: 'Copy', fr: 'Copier' })}
          onClick={() => void copyToClipboard(message.content)}
        >
          <Copy size={13} />
        </button>
        <button type="button" title={t({ en: 'Edit', fr: 'Modifier' })} onClick={() => setDraft(message.content)}>
          <Pencil size={13} />
        </button>
        <button
          type="button"
          title={t({ en: 'Resend', fr: 'Renvoyer' })}
          onClick={() => void replayMessage(message.id)}
        >
          <RotateCcw size={13} />
        </button>
        <button
          type="button"
          title={t({ en: 'Fork from here', fr: 'Dupliquer depuis ici' })}
          onClick={() => void forkAt(message.id)}
        >
          <GitFork size={13} />
        </button>
        <MessagePluginActions messageId={message.id} />
      </div>
      <div className={styles.user}>{message.content}</div>
      {message.attachments && message.attachments.length > 0 && (
        <Suspense fallback={null}>
          <MessageAttachments attachments={message.attachments} messageId={message.id} />
        </Suspense>
      )}
    </div>
  )
}

const MessageRow = memo(function MessageRow({ id }: { id: string }) {
  const message = useFeed((state) => state.byId[id])
  if (!message) return null
  return message.role === 'assistant' ? <Assistant message={message} /> : <Other message={message} />
})

function SubAgent({ item }: { item: Extract<FeedItem, { kind: 'subagent' }> }) {
  const running = useFeed((state) => item.ids.some((id) => state.byId[id]?.isStreaming))
  const [open, setOpen] = useState(false)
  return (
    <div className={styles.subAgent}>
      <button
        type="button"
        className={styles.toolHeader}
        data-status={running ? 'pending' : 'success'}
        onClick={() => setOpen(!open)}
      >
        <span className={styles.toolStatus}>{running ? '●' : '✓'}</span>
        <span className={styles.toolName}>{item.subAgentType}</span>
      </button>
      {open && (
        <div className={styles.subAgentBody}>
          {item.ids.map((id) => (
            <MessageRow key={id} id={id} />
          ))}
        </div>
      )}
    </div>
  )
}

export const FeedRow = memo(function FeedRow({ item }: { item: FeedItem }) {
  if (item.kind === 'divider')
    return (
      <div className={styles.divider}>{t({ en: 'Earlier context summarized', fr: 'Contexte antérieur résumé' })}</div>
    )
  if (item.kind === 'subagent') return <SubAgent item={item} />
  return <MessageRow id={item.id} />
})
