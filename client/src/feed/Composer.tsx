import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import { Paperclip, Pause, Play, Send, Square, X } from 'lucide-react'
import type { Attachment } from '@shared/types.js'
import { launchWorkflow, pauseGeneration, resumeGeneration, runCommand, sendMessage, stopGeneration } from '../actions'
import { getJson } from '../api'
import { t } from '../i18n'
import { processFile } from '../lib/file-processing'
import { PluginActions, PluginZone, usePluginContext } from '../plugins/Slots'
import { useApp } from '../store/app'
import { useFeed } from '../store/feed'
import { ComposerBar } from './ComposerBar'
import { activeTrigger, applySuggestion, type Suggestion } from './suggestions'
import styles from './Feed.module.css'

const QueuedMessages = lazy(() => import('./QueuedMessages'))

interface FileMatch {
  path: string
  name: string
}

function userHistory(): string[] {
  const { ids, byId } = useFeed.getState()
  return ids.flatMap((id) => {
    const message = byId[id]
    return message?.role === 'user' && !message.isSystemGenerated && message.content ? [message.content] : []
  })
}

export function Composer() {
  const pluginContext = usePluginContext()
  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [attachError, setAttachError] = useState<string | null>(null)
  const [cursor, setCursor] = useState(0)
  const [selected, setSelected] = useState(0)
  const [fileMatches, setFileMatches] = useState<FileMatch[]>([])
  const historyIndex = useRef<number | null>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const filePicker = useRef<HTMLInputElement>(null)

  const running = useApp((state) => state.session?.isRunning === true)
  const pauseState = useApp((state) => state.session?.pauseState ?? 'none')
  const hasQueue = useApp((state) => state.queue.length > 0)
  const workdir = useApp((state) => state.session?.workspace ?? state.session?.workdir)
  const commands = useApp((state) => state.commands)
  const workflows = useApp((state) => state.workflows)

  const trigger = activeTrigger(text, cursor)
  const needle = trigger?.query.toLowerCase() ?? ''
  const suggestions: Suggestion[] =
    trigger?.kind === 'slash'
      ? [
          ...workflows.map((w) => ({ id: w.id, label: `/${w.id}`, detail: w.name, insert: `/${w.id} ` })),
          ...commands.map((c) => ({ id: c.id, label: `/${c.id}`, detail: c.name, insert: `/${c.id} ` })),
        ]
          .filter((s) => s.label.toLowerCase().includes(needle))
          .slice(0, 8)
      : trigger?.kind === 'mention'
        ? fileMatches.slice(0, 8).map((f) => ({ id: f.path, label: f.name, detail: f.path, insert: `@${f.path} ` }))
        : []

  const mentionQuery = trigger?.kind === 'mention' ? trigger.query : null
  useEffect(() => {
    if (mentionQuery === null || !workdir) return
    let active = true
    const timer = setTimeout(() => {
      void getJson<FileMatch[]>(
        `/api/files?q=${encodeURIComponent(mentionQuery)}&workdir=${encodeURIComponent(workdir)}`,
      ).then((found) => {
        if (active) setFileMatches(found)
      })
    }, 150)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [mentionQuery, workdir])

  const addFiles = (files: Iterable<File>) => {
    setAttachError(null)
    for (const file of files) {
      void processFile(file, (attachment) => setAttachments((list) => [...list, attachment]), setAttachError)
    }
  }

  const clear = () => {
    setText('')
    setAttachments([])
    historyIndex.current = null
  }

  const send = () => {
    const content = text.trim()
    if (!content && attachments.length === 0) return
    if (content.startsWith('/')) {
      const [first, ...args] = content.slice(1).split(/\s+/)
      if (workflows.some((workflow) => workflow.id === first)) {
        launchWorkflow(first!, Object.fromEntries(args.map((arg, index) => [String(index), arg])))
        clear()
        return
      }
      if (workdir && commands.some((command) => command.id === first)) {
        void runCommand(first!, args, workdir)
        clear()
        return
      }
    }
    void sendMessage({ ...(content ? { content } : {}), ...(attachments.length ? { attachments } : {}) })
    clear()
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    send()
  }

  const pick = (suggestion: Suggestion) => {
    if (!trigger) return
    const next = applySuggestion(text, trigger, suggestion.insert)
    setText(next.text)
    setCursor(next.cursor)
    setSelected(0)
    requestAnimationFrame(() => {
      input.current?.focus()
      input.current?.setSelectionRange(next.cursor, next.cursor)
    })
  }

  const browseHistory = (direction: 1 | -1) => {
    const history = userHistory()
    if (history.length === 0) return false
    const current = historyIndex.current ?? history.length
    const index = Math.min(history.length, Math.max(0, current + direction))
    historyIndex.current = index === history.length ? null : index
    setText(history[index] ?? '')
    return true
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions.length > 0) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const delta = event.key === 'ArrowDown' ? 1 : -1
        setSelected((index) => (index + delta + suggestions.length) % suggestions.length)
        return
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault()
        const suggestion = suggestions[Math.min(selected, suggestions.length - 1)]
        if (suggestion) pick(suggestion)
        return
      }
    }
    if (event.key === 'ArrowUp' && event.currentTarget.selectionStart === 0 && browseHistory(-1)) {
      event.preventDefault()
      return
    }
    if (event.key === 'ArrowDown' && historyIndex.current !== null && browseHistory(1)) {
      event.preventDefault()
      return
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      send()
    }
  }

  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    if (event.clipboardData.files.length > 0) {
      event.preventDefault()
      addFiles(event.clipboardData.files)
    }
  }

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    addFiles(event.dataTransfer.files)
  }

  return (
    <div className={styles.composerArea} onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
      {hasQueue && (
        <Suspense fallback={null}>
          <QueuedMessages />
        </Suspense>
      )}
      <PluginZone id="composer.top" context={pluginContext} />
      <div className={styles.pluginRow}>
        <PluginActions slot="composer.top" context={pluginContext} />
        <PluginActions slot="composer.actions" context={pluginContext} />
      </div>
      {attachError && <div className={styles.attachError}>{attachError}</div>}
      {attachments.length > 0 && (
        <div className={styles.attachments}>
          {attachments.map((attachment) => (
            <span key={attachment.id} className={styles.attachment}>
              <span className={styles.truncate}>{attachment.filename}</span>
              <button
                type="button"
                aria-label={t({ en: 'Remove attachment', fr: 'Retirer la pièce jointe' })}
                onClick={() => setAttachments((list) => list.filter((a) => a.id !== attachment.id))}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      {suggestions.length > 0 && (
        <ul className={styles.suggestions} data-testid="suggestions">
          {suggestions.map((suggestion, index) => (
            <li key={suggestion.id}>
              <button
                type="button"
                data-selected={index === selected || undefined}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick(suggestion)}
              >
                <span>{suggestion.label}</span>
                <span className={styles.suggestionDetail}>{suggestion.detail}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className={styles.composer} onSubmit={submit}>
        <input
          ref={filePicker}
          type="file"
          multiple
          hidden
          onChange={(event) => {
            if (event.target.files) addFiles(event.target.files)
            event.target.value = ''
          }}
        />
        <button
          type="button"
          className={styles.attach}
          aria-label={t({ en: 'Attach files', fr: 'Joindre des fichiers' })}
          onClick={() => filePicker.current?.click()}
        >
          <Paperclip size={16} />
        </button>
        <textarea
          ref={input}
          className={styles.input}
          data-testid="chat-input-textarea"
          rows={2}
          value={text}
          onChange={(event) => {
            setText(event.target.value)
            setCursor(event.target.selectionStart)
            setSelected(0)
          }}
          onSelect={(event) => setCursor(event.currentTarget.selectionStart)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          placeholder={t({
            en: 'Message the agent…  ( / commands, @ files )',
            fr: 'Message à l’agent…  ( / commandes, @ fichiers )',
          })}
        />
        {running && (
          <>
            <button
              className={styles.attach}
              type="button"
              data-testid="chat-pause-button"
              aria-label={
                pauseState === 'none' ? t({ en: 'Pause', fr: 'Mettre en pause' }) : t({ en: 'Resume', fr: 'Reprendre' })
              }
              onClick={() => void (pauseState === 'none' ? pauseGeneration() : resumeGeneration())}
            >
              {pauseState === 'none' ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <button
              className={styles.stop}
              type="button"
              data-testid="chat-stop-button"
              aria-label={t({ en: 'Stop', fr: 'Arrêter' })}
              onClick={() => void stopGeneration()}
            >
              <Square size={16} />
            </button>
          </>
        )}
        <button
          className={styles.send}
          type="submit"
          data-testid="chat-send-button"
          aria-label={t({ en: 'Send', fr: 'Envoyer' })}
        >
          <Send size={16} />
        </button>
      </form>
      <ComposerBar />
    </div>
  )
}
