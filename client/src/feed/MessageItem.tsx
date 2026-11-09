import { memo, useMemo, useRef, useState } from 'react'
import { Copy, GitFork, Pencil, RotateCcw } from 'lucide-react'
import type { Message } from '@shared/types.js'
import { forkAt, replayMessage } from '../actions'
import { t } from '../i18n'
import { copyToClipboard } from '../lib/clipboard'
import { formatTime } from '../lib/format-stats'
import { PluginActions, usePluginContext } from '../plugins/Slots'
import { scanBlocks } from '../markdown/blocks'
import { useMarkdownHtml } from '../markdown/cache'
import { useApp } from '../store/app'
import { useFeed } from '../store/feed'
import { toElements } from './elements'
import type { FeedItem } from './items'
import { CriteriaCard, PreparingCard, ToolCard } from './ToolCard'
import styles from './Feed.module.css'

const Block = memo(function Block({ source }: { source: string }) {
  const html = useMarkdownHtml(source)
  if (html === null) return <div className={styles.pending}>{source}</div>
  return <div className={styles.block} dangerouslySetInnerHTML={{ __html: html }} />
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

function Thinking({ text, active, duration }: { text: string; active: boolean; duration: number | undefined }) {
  const [open, setOpen] = useState(useApp.getState().display['display.showThinking'] === 'true')
  const label = active
    ? t({ en: 'Thinking…', fr: 'Réflexion…' })
    : duration
      ? t({ en: 'Thought for {{time}}', fr: 'A réfléchi pendant {{time}}' }, { time: formatTime(duration) })
      : t({ en: 'Thought', fr: 'A réfléchi' })
  return (
    <div className={styles.thinking}>
      <button type="button" onClick={() => setOpen(!open)}>
        {label}
      </button>
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
    <>
      {thinking && (
        <Thinking
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
    </>
  )
}

function AutoPrompt({ message }: { message: Message }) {
  const [open, setOpen] = useState(false)
  const metadata = message.metadata
  const kind =
    metadata?.kind === 'reminder' ? t({ en: 'reminder', fr: 'rappel' }) : t({ en: 'instructions', fr: 'instructions' })
  return (
    <div className={styles.autoPrompt}>
      <button type="button" onClick={() => setOpen(!open)}>
        <span className={styles.autoPromptDot} style={{ background: metadata?.color ?? 'currentColor' }} />
        <span>{`${metadata?.name ?? t({ en: 'Agent', fr: 'Agent' })} · ${kind}`}</span>
      </button>
      {open && <pre className={styles.toolOutput}>{message.content}</pre>}
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
  if (message.role === 'system') return <div className={styles.system}>{message.content}</div>
  if (message.isSystemGenerated) {
    return (
      <div className={styles.user} data-system>
        {message.content}
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
