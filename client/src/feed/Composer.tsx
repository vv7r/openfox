import {
  lazy,
  Suspense,
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
import { t } from '../i18n'
import { processFile } from '../lib/file-processing'
import { PluginActions, PluginZone, usePluginContext } from '../plugins/Slots'
import { useApp } from '../store/app'
import { useFeed } from '../store/feed'
import { ComposerBar } from './ComposerBar'
import type { ParamRequest } from './launch'
import { MoreButton } from './MoreButton'
import { trimTailDeletion, useInputHeight } from './useInputHeight'
import { ParamHint, SuggestionList, useSuggestions } from './useSuggestions'
import styles from './Feed.module.css'

const QueuedMessages = lazy(() => import('./QueuedMessages'))
const ParamsDialog = lazy(() => import('./ParamsDialog'))

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
  const [paramRequest, setParamRequest] = useState<ParamRequest | null>(null)
  const historyIndex = useRef<number | null>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const filePicker = useRef<HTMLInputElement>(null)
  const height = useInputHeight(input, text)

  const running = useApp((state) => state.session?.isRunning === true)
  const pauseState = useApp((state) => state.session?.pauseState ?? 'none')
  const hasQueue = useApp((state) => state.queue.length > 0)
  const workdir = useApp((state) => state.session?.workspace ?? state.session?.workdir)
  const commands = useApp((state) => state.commands)
  const workflows = useApp((state) => state.workflows)

  const { suggestions, selected, pick, handleKey, missingParams, resetSelection } = useSuggestions({
    text,
    setText,
    cursor,
    setCursor,
    input,
    workdir,
  })

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
    if (handleKey(event)) return
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
      <SuggestionList suggestions={suggestions} selected={selected} onPick={pick} />
      <ParamHint count={missingParams} />
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
        <div className={styles.inputWrap}>
          <div
            className={styles.inputHandle}
            data-testid="composer-resize"
            role="separator"
            aria-orientation="horizontal"
            title={t({
              en: 'Drag to resize, double-click for automatic height',
              fr: 'Glisser pour redimensionner, double-cliquer pour la hauteur automatique',
            })}
            onPointerDown={height.startResize}
            onDoubleClick={height.resetHeight}
          />
          <textarea
            ref={input}
            className={styles.input}
            data-testid="chat-input-textarea"
            rows={1}
            value={text}
            onChange={(event) => {
              const value = trimTailDeletion(text, event.target.value)
              setText(value)
              setCursor(Math.min(event.target.selectionStart, value.length))
              resetSelection()
            }}
            onSelect={(event) => setCursor(event.currentTarget.selectionStart)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            placeholder={t({
              en: 'Message the agent…  ( / commands, @ files )',
              fr: 'Message à l’agent…  ( / commandes, @ fichiers )',
            })}
          />
        </div>
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
        <div className={styles.sendGroup}>
          <button
            className={styles.send}
            type="submit"
            data-testid="chat-send-button"
            aria-label={t({ en: 'Send', fr: 'Envoyer' })}
          >
            <Send size={16} />
          </button>
          <MoreButton
            workdir={workdir}
            typedText={text}
            attachments={attachments}
            clearComposer={clear}
            askParams={setParamRequest}
          />
        </div>
      </form>
      <ComposerBar />
      {paramRequest && (
        <Suspense fallback={null}>
          <ParamsDialog request={paramRequest} close={() => setParamRequest(null)} />
        </Suspense>
      )}
    </div>
  )
}
