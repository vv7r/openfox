import { memo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { normalizeAskOptions } from '@shared/ask-options.js'
import type { PreparingToolCall, ToolCall } from '@shared/types.js'
import { answerQuestion, confirmPath } from '../actions'
import { t } from '../i18n'
import { formatToolArgsWithMetadata } from '../lib/formatToolArgs'
import { deriveToolCallStatus, type ToolStatus } from '../lib/toolStatus'
import { useApp } from '../store/app'
import { useToolViews } from './tools/loader'
import styles from './Feed.module.css'

const COLLAPSE_ABOVE_CHARS = 600

const STATUS_ICON: Record<ToolStatus, string> = { pending: '●', success: '✓', error: '✗', interrupted: '✗' }

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

export const ToolCard = memo(function ToolCard({ call }: { call: ToolCall }) {
  const status = deriveToolCallStatus(call.result)
  const hasConfirmation = useApp((state) =>
    state.confirmations.some((c) => c.callId === call.id || c.callId.startsWith(`${call.id}-`)),
  )
  const size =
    (call.result?.output?.length ?? 0) +
    (typeof call.arguments['content'] === 'string' ? call.arguments['content'].length : 0)
  const [toggled, setToggled] = useState<boolean | null>(null)
  const verbose = useApp((state) => state.display['display.showVerboseToolOutput'] !== 'false')
  const collapseLarge = useApp((state) => state.display['display.collapseLargeToolCalls'] !== 'false')
  const views = useToolViews()

  if (call.name === 'ask_user') return <AskUser call={call} />
  if (call.name === 'todo_write') return <Todos call={call} />

  const expanded =
    toggled ?? (hasConfirmation || (verbose && (!collapseLarge || status === 'pending' || size < COLLAPSE_ABOVE_CHARS)))
  const remote = views?.detectRemoteExecution(call.name, call.arguments) ?? null
  const label = formatToolArgsWithMetadata(call.name, call.arguments, call.result?.metadata)
  const Chevron = expanded ? ChevronDown : ChevronRight

  if (call.name === 'step_done') {
    return (
      <div className={styles.toolHeader} data-status={status}>
        <span className={styles.toolStatus}>{STATUS_ICON[status]}</span>
        <span className={styles.toolName}>{call.name}</span>
      </div>
    )
  }

  return (
    <div className={styles.tool} data-testid="tool-card" data-remote={remote ? true : undefined}>
      <button
        type="button"
        className={styles.toolHeader}
        data-status={status}
        aria-expanded={expanded}
        onClick={() => setToggled(!expanded)}
      >
        <Chevron size={13} className={styles.toolChevron} />
        <span className={styles.toolStatus}>{STATUS_ICON[status]}</span>
        <span className={styles.toolName}>{call.name}</span>
        <span className={styles.toolArgs}>{label}</span>
        {call.result && <span className={styles.toolDuration}>{`${(call.result.durationMs / 1000).toFixed(1)}s`}</span>}
      </button>
      {expanded && (
        <>
          {views && <views.ToolDetails call={call} status={status} remote={remote} />}
          <PathConfirmation callId={call.id} />
        </>
      )}
    </div>
  )
})

export function CriteriaCard({ calls, preparing }: { calls: ToolCall[]; preparing: PreparingToolCall[] }) {
  const views = useToolViews()
  return views && <views.CriteriaGroup calls={calls} preparing={preparing} />
}

export function PreparingCard({ preparing }: { preparing: PreparingToolCall }) {
  const views = useToolViews()
  const showPreview = useApp(
    (state) =>
      state.display['display.showToolCallStreaming'] === 'true' &&
      state.display['display.showVerboseToolOutput'] !== 'false',
  )
  const command =
    preparing.name === 'run_command' && preparing.arguments ? views?.extractCommand(preparing.arguments) : null
  const remote = command ? views?.detectRemoteCommand(command) : null
  return (
    <div className={styles.tool} data-remote={remote ? true : undefined}>
      <div className={styles.toolHeader} data-status="pending">
        <span className={styles.toolStatus}>{STATUS_ICON.pending}</span>
        <span className={styles.toolName}>{preparing.name}</span>
        <span className={styles.toolArgs}>{command ?? preparing.arguments?.slice(-160)}</span>
      </div>
      {showPreview && views && <views.PreparingPreview preparing={preparing} />}
    </div>
  )
}
