import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import * as Popover from '@radix-ui/react-popover'
import { ChevronDown, Paperclip, Undo2, X } from 'lucide-react'
import type { Attachment, ProjectTask } from '@shared/types.js'
import feedStyles from '../../feed/Feed.module.css'
import { ModelList } from '../../feed/ModelList'
import { ParamHint, SuggestionList, useSuggestions } from '../../feed/useSuggestions'
import { t } from '../../i18n'
import { processFile } from '../../lib/file-processing'
import { useApp } from '../../store/app'
import panelStyles from '../Panels.module.css'
import { ScheduleFields } from './ScheduleFields'
import { saveTask, useBoards } from './boardStore'
import { scheduleForm, taskPayload, validateSchedule, type ScheduleForm } from './taskForm'
import styles from './Tasks.module.css'

const DRAFT_PREFIX = 'openfox:task-draft'
const DRAFT_DELAY_MS = 300
const MAX_UNDO = 50

function readDraft(key: string): string | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? ((JSON.parse(raw) as { prompt?: string }).prompt ?? null) : null
  } catch {
    return null
  }
}

function writeDraft(key: string, prompt: string | null): void {
  try {
    if (prompt === null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify({ prompt }))
  } catch {
    // A lost draft only costs what was typed since the last save
  }
}

interface ModelFieldProps {
  providerId: string | undefined
  model: string | undefined
  onChange: (providerId: string | undefined, model: string | undefined) => void
}

function ModelField({ providerId, model, onChange }: ModelFieldProps) {
  const [open, setOpen] = useState(false)
  const pick = (nextProvider: string | undefined, nextModel: string | undefined) => {
    setOpen(false)
    onChange(nextProvider, nextModel)
  }
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger type="button" className={styles.modelButton} data-testid="task-model">
        <span className={styles.truncate}>
          {providerId && model ? model : t({ en: 'Default model', fr: 'Modèle par défaut' })}
        </span>
        <ChevronDown size={13} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className={feedStyles.picker} align="start" sideOffset={6}>
          <ModelList
            selected={model}
            onPick={pick}
            before={
              <button type="button" className={feedStyles.pickerItem} onClick={() => pick(undefined, undefined)}>
                {t({ en: 'Default model', fr: 'Modèle par défaut' })}
              </button>
            }
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

interface Props {
  projectId: string
  task: ProjectTask | null
  onClose: () => void
}

/** Ctrl+Enter saves; plain Enter inserts a new line, the opposite of the chat composer. */
export function TaskEditor({ projectId, task, onClose }: Props) {
  const draftKey = `${DRAFT_PREFIX}:${projectId}:${task?.id ?? 'new'}`
  const agents = useApp((state) => state.agents)
  const workdir = useApp((state) => state.projects.find((project) => project.id === projectId)?.workdir)

  const [prompt, setPrompt] = useState(() => readDraft(draftKey) ?? task?.prompt ?? '')
  const [cursor, setCursor] = useState(0)
  const [attachments, setAttachments] = useState<Attachment[]>(task?.attachments ?? [])
  const [agentId, setAgentId] = useState(task?.agentId)
  const [providerId, setProviderId] = useState(task?.providerId)
  const [model, setModel] = useState(task?.model)
  const [schedule, setSchedule] = useState<ScheduleForm>(() => scheduleForm(task?.schedule))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [canUndo, setCanUndo] = useState(false)
  const undoStack = useRef<string[]>([])
  const input = useRef<HTMLTextAreaElement>(null)
  const filePicker = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const timer = setTimeout(() => writeDraft(draftKey, prompt), DRAFT_DELAY_MS)
    return () => clearTimeout(timer)
  }, [prompt, draftKey])

  const changePrompt = (value: string) => {
    if (value === prompt) return
    undoStack.current.push(prompt)
    if (undoStack.current.length > MAX_UNDO) undoStack.current.shift()
    setCanUndo(true)
    setPrompt(value)
  }

  const undo = () => {
    const previous = undoStack.current.pop()
    if (previous === undefined) return
    setPrompt(previous)
    setCanUndo(undoStack.current.length > 0)
    input.current?.focus()
  }

  const { suggestions, selected, pick, handleKey, missingParams, resetSelection } = useSuggestions({
    text: prompt,
    setText: changePrompt,
    cursor,
    setCursor,
    input,
    workdir,
  })

  const addFiles = (files: Iterable<File>) => {
    for (const file of files) {
      void processFile(file, (attachment) => setAttachments((list) => [...list, attachment]), setError)
    }
  }

  const save = async () => {
    if (!prompt.trim() && attachments.length === 0) {
      setError(t({ en: 'Add a prompt or an attachment', fr: 'Ajoutez une invite ou une pièce jointe' }))
      return
    }
    const invalid = validateSchedule(schedule)
    if (invalid) {
      setError(t(invalid))
      return
    }
    setSaving(true)
    setError(null)
    const payload = taskPayload({ prompt, attachments, agentId, providerId, model, schedule }, task)
    const saved = await saveTask(projectId, task?.id ?? null, payload)
    setSaving(false)
    if (saved) {
      writeDraft(draftKey, null)
      onClose()
    } else {
      setError(
        useBoards.getState().error ?? t({ en: 'Could not save the task', fr: 'Impossible d’enregistrer la tâche' }),
      )
    }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (handleKey(event)) return
    if (event.key === 'z' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      undo()
      return
    }
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing) {
      event.preventDefault()
      void save()
    }
  }

  const onPaste = (event: ClipboardEvent) => {
    if (event.clipboardData.files.length > 0) addFiles(event.clipboardData.files)
  }

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    addFiles(event.dataTransfer.files)
  }

  const alreadyRunning = task?.status === 'in_progress' && task.runState === 'running'

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className={panelStyles.overlay} />
        <Dialog.Content className={panelStyles.dialog} data-testid="task-editor" aria-describedby={undefined}>
          <div className={panelStyles.header}>
            <Dialog.Title className={panelStyles.title}>
              {task ? t({ en: 'Edit task', fr: 'Modifier la tâche' }) : t({ en: 'New task', fr: 'Nouvelle tâche' })}
            </Dialog.Title>
            <Dialog.Close className={panelStyles.close} aria-label={t({ en: 'Close', fr: 'Fermer' })}>
              <X size={16} />
            </Dialog.Close>
          </div>
          <div className={panelStyles.body}>
            <div className={panelStyles.stack}>
              {alreadyRunning && (
                <p className={styles.notice}>
                  {t({
                    en: 'This task is already in progress. Changes apply to the next run.',
                    fr: 'Cette tâche est déjà en cours. Les modifications s’appliqueront à la prochaine exécution.',
                  })}
                </p>
              )}
              <div onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
                <div className={styles.promptBox}>
                  <textarea
                    ref={input}
                    autoFocus
                    className={styles.promptInput}
                    data-testid="task-prompt"
                    spellCheck={false}
                    value={prompt}
                    placeholder={t({
                      en: 'Describe the task. Slash commands (/cmd) and workflows resolve exactly as in chat when the task launches.',
                      fr: 'Décrivez la tâche. Les commandes slash (/cmd) et les workflows se résolvent exactement comme dans le chat au lancement de la tâche.',
                    })}
                    onChange={(event) => {
                      setCursor(event.target.selectionStart)
                      changePrompt(event.target.value)
                      resetSelection()
                    }}
                    onSelect={(event) => setCursor(event.currentTarget.selectionStart)}
                    onKeyDown={onKeyDown}
                    onPaste={onPaste}
                  />
                  <div className={styles.promptTools}>
                    <button
                      type="button"
                      disabled={!canUndo}
                      aria-label={t({ en: 'Undo (Ctrl+Z)', fr: 'Annuler (Ctrl+Z)' })}
                      onClick={undo}
                    >
                      <Undo2 size={14} />
                    </button>
                    <button
                      type="button"
                      aria-label={t({ en: 'Attach files', fr: 'Joindre des fichiers' })}
                      onClick={() => filePicker.current?.click()}
                    >
                      <Paperclip size={14} />
                    </button>
                  </div>
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
                </div>
                <ParamHint count={missingParams} />
                <SuggestionList suggestions={suggestions} selected={selected} onPick={pick} />
              </div>
              {attachments.length > 0 && (
                <div className={styles.chips}>
                  {attachments.map((attachment) => (
                    <span key={attachment.id} className={styles.chip}>
                      <span className={styles.truncate}>{attachment.filename}</span>
                      <button
                        type="button"
                        className={styles.chipRemove}
                        aria-label={t({ en: 'Remove attachment', fr: 'Retirer la pièce jointe' })}
                        onClick={() => setAttachments((list) => list.filter((item) => item.id !== attachment.id))}
                      >
                        <X size={11} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className={styles.twoColumns}>
                <label className={panelStyles.field}>
                  {t({ en: 'Agent', fr: 'Agent' })}
                  <select
                    className={panelStyles.input}
                    data-testid="task-agent"
                    value={agentId ?? ''}
                    onChange={(event) => setAgentId(event.target.value || undefined)}
                  >
                    <option value="">{t({ en: 'Default agent', fr: 'Agent par défaut' })}</option>
                    {agents.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className={panelStyles.field}>
                  <span>{t({ en: 'Model', fr: 'Modèle' })}</span>
                  <ModelField
                    providerId={providerId}
                    model={model}
                    onChange={(nextProvider, nextModel) => {
                      setProviderId(nextProvider)
                      setModel(nextModel)
                    }}
                  />
                </div>
              </div>
              <ScheduleFields form={schedule} onChange={(change) => setSchedule((form) => ({ ...form, ...change }))} />
              {error && <p className={panelStyles.error}>{error}</p>}
              <div className={panelStyles.row}>
                <span className={`${panelStyles.muted} ${panelStyles.grow}`}>
                  {t({
                    en: 'Ctrl/Cmd+Enter to save, Enter for a new line',
                    fr: 'Ctrl/Cmd+Entrée pour enregistrer, Entrée pour une nouvelle ligne',
                  })}
                </span>
                <button type="button" onClick={onClose}>
                  {t({ en: 'Cancel', fr: 'Annuler' })}
                </button>
                <button
                  type="button"
                  className={panelStyles.primary}
                  data-testid="task-save"
                  disabled={saving}
                  onClick={() => void save()}
                >
                  {task
                    ? t({ en: 'Save changes', fr: 'Enregistrer les modifications' })
                    : t({ en: 'Create task', fr: 'Créer la tâche' })}
                </button>
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
