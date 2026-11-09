import { memo, useState } from 'react'
import { normalizeAskOptions } from '@shared/ask-options.js'
import type { PreparingToolCall, ToolCall } from '@shared/types.js'
import { answerQuestion, confirmPath } from '../actions'
import { t } from '../i18n'
import { formatToolArgsWithMetadata } from '../lib/formatToolArgs'
import { deriveToolCallStatus, type ToolStatus } from '../lib/toolStatus'
import { useApp } from '../store/app'
import styles from './Feed.module.css'

const COLLAPSE_ABOVE_CHARS = 600
const MAX_SHOWN_CHARS = 40_000

const STATUS_ICON: Record<ToolStatus, string> = { pending: '●', success: '✓', error: '✗', interrupted: '✗' }

function Output({ text }: { text: string }) {
  const shown = text.length > MAX_SHOWN_CHARS ? text.slice(-MAX_SHOWN_CHARS) : text
  return <pre className={styles.toolOutput}>{shown}</pre>
}

function EditDiff({ call }: { call: ToolCall }) {
  const regions = call.result?.editContext?.regions
  if (!regions?.length) {
    const oldText = String(call.arguments['old_string'] ?? '')
    const newText = String(call.arguments['new_string'] ?? '')
    return <DiffLines removed={oldText} added={newText} />
  }
  return (
    <>
      {regions.map((region, index) => (
        <div key={index} className={styles.toolOutput}>
          {region.beforeContext.map((line) => (
            <div key={`b${line.lineNumber}`} className={styles.diffContext}>
              {line.content}
            </div>
          ))}
          {region.edits.map((edit, editIndex) => (
            <DiffLines key={editIndex} removed={edit.oldContent} added={edit.newContent} bare />
          ))}
          {region.afterContext.map((line) => (
            <div key={`a${line.lineNumber}`} className={styles.diffContext}>
              {line.content}
            </div>
          ))}
        </div>
      ))}
    </>
  )
}

function DiffLines({ removed, added, bare = false }: { removed: string; added: string; bare?: boolean }) {
  const body = (
    <>
      {removed &&
        removed.split('\n').map((line, index) => (
          <div key={`r${index}`} className={styles.diffRemoved}>
            {line}
          </div>
        ))}
      {added &&
        added.split('\n').map((line, index) => (
          <div key={`a${index}`} className={styles.diffAdded}>
            {line}
          </div>
        ))}
    </>
  )
  return bare ? body : <div className={styles.toolOutput}>{body}</div>
}

function PathConfirmation({ callId }: { callId: string }) {
  const confirmation = useApp((state) =>
    state.confirmations.find((c) => c.callId === callId || c.callId.startsWith(`${callId}-`)),
  )
  if (!confirmation) return null
  return (
    <div className={styles.confirmation}>
      <strong>{t({ en: 'Permission required', fr: 'Autorisation requise' })}</strong>
      {confirmation.paths.map((path) => (
        <code key={path}>{path}</code>
      ))}
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.primaryAction}
          onClick={() => void confirmPath(confirmation.callId, true)}
        >
          {t({ en: 'Allow', fr: 'Autoriser' })}
        </button>
        <button type="button" onClick={() => void confirmPath(confirmation.callId, true, true)}>
          {t({ en: 'Always allow', fr: 'Toujours autoriser' })}
        </button>
        <button type="button" onClick={() => void confirmPath(confirmation.callId, false)}>
          {t({ en: 'Deny', fr: 'Refuser' })}
        </button>
      </div>
    </div>
  )
}

function AskUser({ call }: { call: ToolCall }) {
  const question = useApp((state) => state.questions.find((q) => q.callId === call.id))
  const [answer, setAnswer] = useState('')
  const prompt = String(call.arguments['question'] ?? question?.question ?? '')
  const options = normalizeAskOptions(question?.options)

  if (!question) {
    return (
      <div className={styles.confirmation}>
        <strong>{prompt}</strong>
        {call.result?.output && <span>{call.result.output}</span>}
      </div>
    )
  }

  return (
    <div className={styles.confirmation} data-testid="ask-user">
      <strong>{prompt}</strong>
      {options?.length ? (
        <div className={styles.actions}>
          {options.map((option) => (
            <button key={option.value} type="button" onClick={() => void answerQuestion(question.callId, option.value)}>
              {option.label}
            </button>
          ))}
        </div>
      ) : question.type === 'confirm' ? (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primaryAction}
            onClick={() => void answerQuestion(question.callId, 'yes')}
          >
            {t({ en: 'Yes', fr: 'Oui' })}
          </button>
          <button type="button" onClick={() => void answerQuestion(question.callId, 'no')}>
            {t({ en: 'No', fr: 'Non' })}
          </button>
        </div>
      ) : (
        <form
          className={styles.actions}
          onSubmit={(event) => {
            event.preventDefault()
            if (answer.trim()) void answerQuestion(question.callId, answer.trim())
          }}
        >
          <input className={styles.answerInput} value={answer} onChange={(event) => setAnswer(event.target.value)} />
          <button type="submit" className={styles.primaryAction}>
            {t({ en: 'Answer', fr: 'Répondre' })}
          </button>
          <button type="button" onClick={() => void answerQuestion(question.callId, '', true)}>
            {t({ en: 'Skip', fr: 'Passer' })}
          </button>
        </form>
      )}
    </div>
  )
}

function Todos({ call }: { call: ToolCall }) {
  const todos = Array.isArray(call.arguments['todos'])
    ? (call.arguments['todos'] as Array<{ content?: string; status?: string }>)
    : []
  return (
    <ul className={styles.todos}>
      {todos.map((todo, index) => (
        <li key={index} data-status={todo.status}>
          {todo.content}
        </li>
      ))}
    </ul>
  )
}

function Details({ call }: { call: ToolCall }) {
  const { name, arguments: args, result } = call
  const streamed = call.streamingOutput?.map((chunk) => chunk.content).join('')
  const failure = result?.error
  return (
    <div className={styles.toolBody}>
      {name === 'run_command' && <code className={styles.command}>{String(args['command'] ?? '')}</code>}
      {name === 'edit_file' && result?.success && <EditDiff call={call} />}
      {name === 'write_file' && typeof args['content'] === 'string' && !result?.output && (
        <Output text={args['content']} />
      )}
      {streamed && <Output text={streamed} />}
      {result?.output && name !== 'edit_file' && <Output text={result.output} />}
      {failure && <pre className={styles.toolError}>{failure}</pre>}
      {result?.truncated && (
        <span className={styles.toolNote}>{t({ en: 'Output truncated', fr: 'Sortie tronquée' })}</span>
      )}
      {result?.diagnostics?.map((diagnostic, index) => (
        <div key={index} className={styles.toolNote}>
          {`${diagnostic.severity} ${diagnostic.range.start.line + 1}: ${diagnostic.message}`}
        </div>
      ))}
    </div>
  )
}

export const ToolCard = memo(function ToolCard({ call }: { call: ToolCall }) {
  const status = deriveToolCallStatus(call.result)
  const hasConfirmation = useApp((state) =>
    state.confirmations.some((c) => c.callId === call.id || c.callId.startsWith(`${call.id}-`)),
  )
  const size =
    (call.result?.output?.length ?? 0) +
    (typeof call.arguments['content'] === 'string' ? call.arguments['content'].length : 0)
  const [toggled, setToggled] = useState<boolean | null>(null)

  if (call.name === 'ask_user') return <AskUser call={call} />
  if (call.name === 'todo_write') return <Todos call={call} />

  const expanded = toggled ?? (hasConfirmation || status === 'pending' || size < COLLAPSE_ABOVE_CHARS)
  const label = formatToolArgsWithMetadata(call.name, call.arguments, call.result?.metadata)

  if (call.name === 'step_done') {
    return (
      <div className={styles.toolHeader} data-status={status}>
        <span className={styles.toolStatus}>{STATUS_ICON[status]}</span>
        <span className={styles.toolName}>{call.name}</span>
      </div>
    )
  }

  return (
    <div className={styles.tool} data-testid="tool-card">
      <button type="button" className={styles.toolHeader} data-status={status} onClick={() => setToggled(!expanded)}>
        <span className={styles.toolStatus}>{STATUS_ICON[status]}</span>
        <span className={styles.toolName}>{call.name}</span>
        <span className={styles.toolArgs}>{label}</span>
        {call.result && <span className={styles.toolDuration}>{`${(call.result.durationMs / 1000).toFixed(1)}s`}</span>}
      </button>
      {expanded && (
        <>
          <PathConfirmation callId={call.id} />
          <Details call={call} />
        </>
      )}
    </div>
  )
})

export function PreparingCard({ preparing }: { preparing: PreparingToolCall }) {
  return (
    <div className={styles.tool}>
      <div className={styles.toolHeader} data-status="pending">
        <span className={styles.toolStatus}>{STATUS_ICON.pending}</span>
        <span className={styles.toolName}>{preparing.name}</span>
        <span className={styles.toolArgs}>{preparing.arguments?.slice(-160)}</span>
      </div>
    </div>
  )
}
