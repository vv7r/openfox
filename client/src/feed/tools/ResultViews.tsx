import type { ComponentType, ReactNode } from 'react'
import type { Translation } from '@shared/i18n/index.js'
import { t } from '../../i18n'
import { parseTaskView, type TaskView } from './parse'
import styles from './Tools.module.css'

interface ViewProps {
  result: string
  action: string
}

function Raw({ result }: { result: string }) {
  return <pre className={styles.output}>{result}</pre>
}

function Empty({ text }: { text: Translation }) {
  return <p className={styles.note}>{t(text)}</p>
}

function Field({ label, children }: { label: Translation; children: ReactNode }) {
  return (
    <div className={styles.field}>
      <span>{t(label)}</span>
      <strong>{children}</strong>
    </div>
  )
}

function parse(result: string): Record<string, unknown> | null {
  try {
    return JSON.parse(result) as Record<string, unknown>
  } catch {
    return null
  }
}

function LogLines({ lines, footer }: { lines: Array<{ text: string; stderr: boolean }>; footer?: string | undefined }) {
  return (
    <>
      <div className={styles.output}>
        {lines.map((line, index) => (
          <div key={index} className={line.stderr ? styles.stderr : undefined}>
            {line.text}
          </div>
        ))}
      </div>
      {footer && <p className={styles.note}>{footer}</p>}
    </>
  )
}

const shownOf = (shown: number, total: number) =>
  t({ en: 'Showing {{shown}} of {{total}} lines', fr: 'Affichage de {{shown}} sur {{total}} lignes' }, { shown, total })

function DevServerView({ result, action }: ViewProps) {
  const data = parse(result)
  if (!data) return <Raw result={result} />
  if (action === 'logs') {
    const logs = String(data['logs'] ?? '')
    if (!logs) return <Empty text={{ en: 'No log output', fr: 'Aucune sortie de journal' }} />
    const lines = logs.split('\n').map((line) => ({
      stderr: line.startsWith('[stderr] '),
      text: line.replace(/^\[stderr\] /, ''),
    }))
    return (
      <LogLines
        lines={lines}
        footer={data['hasMore'] ? shownOf(Number(data['limit'] ?? 0), Number(data['total'] ?? 0)) : undefined}
      />
    )
  }
  const url = typeof data['url'] === 'string' ? data['url'] : ''
  return (
    <div className={styles.stack}>
      <Field label={{ en: 'State', fr: 'État' }}>{String(data['state'] ?? '')}</Field>
      {/^https?:/i.test(url) && (
        <Field label={{ en: 'URL', fr: 'URL' }}>
          <a href={url} target="_blank" rel="noopener noreferrer">
            {url}
          </a>
        </Field>
      )}
      {typeof data['error'] === 'string' && <pre className={styles.error}>{data['error']}</pre>}
    </div>
  )
}

function WorkspaceView({ result, action }: ViewProps) {
  const data = parse(result)
  if (!data || (action !== 'list' && action !== 'switch' && action !== 'delete')) return <Raw result={result} />
  if (action === 'list') {
    const workspaces = (data['workspaces'] ?? []) as Array<{ name: string; branch: string | null; active: boolean }>
    if (workspaces.length === 0) return <Empty text={{ en: 'No workspaces found', fr: 'Aucun espace trouvé' }} />
    return (
      <ul className={styles.plainList}>
        {workspaces.map((workspace) => (
          <li key={workspace.name} data-active={workspace.active || undefined}>
            {workspace.name}
            {workspace.branch && <span className={styles.note}>{` · ${workspace.branch}`}</span>}
            {workspace.active && <span className={styles.note}>{t({ en: ' (current)', fr: ' (actuel)' })}</span>}
          </li>
        ))}
      </ul>
    )
  }
  return (
    <div className={styles.stack}>
      {typeof data['message'] === 'string' && <p className={styles.line}>{data['message']}</p>}
      {typeof data['workspace'] === 'string' && <Field label={{ en: 'Name', fr: 'Nom' }}>{data['workspace']}</Field>}
      {typeof data['path'] === 'string' && <Field label={{ en: 'Path', fr: 'Chemin' }}>{data['path']}</Field>}
      {typeof data['branch'] === 'string' && <Field label={{ en: 'Branch', fr: 'Branche' }}>{data['branch']}</Field>}
    </div>
  )
}

interface ProcessInfo {
  id: string
  name: string
  status: string
  pid?: number | null
  command?: string
}

function ProcessCard({ process }: { process: ProcessInfo }) {
  return (
    <div className={styles.card}>
      <div className={styles.field}>
        <strong>{process.name}</strong>
        <span data-status={process.status}>{process.status}</span>
      </div>
      {process.pid != null && <Field label={{ en: 'PID', fr: 'PID' }}>{process.pid}</Field>}
      {process.command && <code className={styles.note}>{process.command}</code>}
    </div>
  )
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  return minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`
}

function BackgroundProcessView({ result, action }: ViewProps) {
  const data = parse(result)
  if (!data) return <Raw result={result} />
  if (action === 'logs') {
    const lines = (data['lines'] ?? []) as Array<{ stream: string; content: string }>
    if (lines.length === 0) return <Empty text={{ en: 'No log output', fr: 'Aucune sortie de journal' }} />
    return (
      <LogLines
        lines={lines.map((line) => ({ text: line.content, stderr: line.stream === 'stderr' }))}
        footer={
          data['hasMore'] && data['totalLines'] != null ? shownOf(lines.length, Number(data['totalLines'])) : undefined
        }
      />
    )
  }
  if (action === 'list') {
    const processes = (data['processes'] ?? []) as ProcessInfo[]
    if (processes.length === 0)
      return <Empty text={{ en: 'No background processes', fr: 'Aucun processus en arrière-plan' }} />
    return (
      <div className={styles.stack}>
        {processes.map((process) => (
          <ProcessCard key={process.id} process={process} />
        ))}
        {data['currentCount'] != null && (
          <p className={styles.note}>
            {t(
              { en: '{{count}} of {{max}} slots used', fr: '{{count}} sur {{max}} emplacements utilisés' },
              { count: Number(data['currentCount']), max: Number(data['maxPerSession'] ?? 0) },
            )}
          </p>
        )}
      </div>
    )
  }
  if (action === 'status') {
    const process = data['process'] as ProcessInfo | undefined
    if (!process) return <Empty text={{ en: 'Process not found', fr: 'Processus introuvable' }} />
    return (
      <div className={styles.stack}>
        <ProcessCard process={process} />
        {data['uptime'] != null && (
          <p className={styles.note}>
            {t(
              { en: 'Uptime: {{time}}', fr: 'En service depuis : {{time}}' },
              { time: formatUptime(Number(data['uptime'])) },
            )}
          </p>
        )}
      </div>
    )
  }
  if (action === 'start' || action === 'stop') {
    return (
      <div className={styles.stack}>
        {typeof data['name'] === 'string' && <Field label={{ en: 'Name', fr: 'Nom' }}>{data['name']}</Field>}
        {typeof data['processId'] === 'string' && <Field label={{ en: 'ID', fr: 'ID' }}>{data['processId']}</Field>}
        {data['pid'] != null && <Field label={{ en: 'PID', fr: 'PID' }}>{Number(data['pid'])}</Field>}
        {typeof data['status'] === 'string' && <Field label={{ en: 'Status', fr: 'Statut' }}>{data['status']}</Field>}
      </div>
    )
  }
  return <Raw result={result} />
}

const TASK_STATUS: Record<string, Translation> = {
  todo: { en: 'To do', fr: 'À faire' },
  in_progress: { en: 'In progress', fr: 'En cours' },
  done: { en: 'Done', fr: 'Terminé' },
}

function TaskCard({ task }: { task: TaskView }) {
  const label = TASK_STATUS[task.status]
  return (
    <div className={styles.card} data-testid="tool-task">
      <div className={styles.badges}>
        <span className={styles.badge} data-status={task.status}>
          {label ? t(label) : task.status}
        </span>
        {task.runState === 'running' && (
          <span className={styles.badge}>{t({ en: 'Running', fr: 'En exécution' })}</span>
        )}
        {task.runState === 'queued' && (
          <span className={styles.badge}>
            {t({ en: 'Queued · #{{position}}', fr: 'En file · #{{position}}' }, { position: task.queuePosition ?? 1 })}
          </span>
        )}
      </div>
      <p className={styles.line}>{task.prompt}</p>
      <div className={styles.badges}>
        {task.boundSession && (
          <span className={styles.note}>
            {t({ en: 'Bound: {{session}}', fr: 'Liée à : {{session}}' }, { session: task.boundSession })}
          </span>
        )}
        {task.model && <span className={styles.badge}>{task.model}</span>}
        {task.attachments != null && task.attachments > 0 && (
          <span className={styles.note}>
            {t(
              {
                en: { one: '{{count}} attachment', other: '{{count}} attachments' },
                fr: { one: '{{count}} pièce jointe', other: '{{count}} pièces jointes' },
              },
              { count: task.attachments },
            )}
          </span>
        )}
        {task.gates.map((gate) => (
          <code key={gate.gateId} className={styles.badge}>{`${gate.gateId}: ${gate.value}`}</code>
        ))}
      </div>
    </div>
  )
}

interface GateView {
  id: string
  name: string
  description?: string
  required: boolean
  variant?: string
}

function requirement(gate: GateView): string {
  return gate.required ? t({ en: 'required', fr: 'requise' }) : t({ en: 'optional', fr: 'facultative' })
}

function GateList({ gates }: { gates: GateView[] }) {
  if (gates.length === 0) return <Empty text={{ en: 'No gates configured', fr: 'Aucune porte configurée' }} />
  return (
    <ul className={styles.plainList}>
      {gates.map((gate) => (
        <li key={gate.id}>
          <code>{gate.id}</code>
          {` ${gate.name} `}
          <span className={styles.badge}>{requirement(gate)}</span>
          {gate.variant && <span className={styles.badge}>{gate.variant}</span>}
          {gate.description && <div className={styles.note}>{gate.description}</div>}
        </li>
      ))}
    </ul>
  )
}

const SINGLE_TASK_ACTIONS = new Set(['get', 'create', 'edit', 'move', 'set_gate_value', 'duplicate', 'reorder'])

function Board({ data }: { data: Record<string, unknown> }) {
  const tasks = Array.isArray(data['tasks']) ? data['tasks'].map(parseTaskView) : []
  const gates = (data['gates'] ?? []) as GateView[]
  const known = new Set(Object.keys(TASK_STATUS))
  const groups = [
    ...Object.entries(TASK_STATUS).map(([status, label]) => ({
      label: t(label),
      tasks: tasks.filter((task) => task.status === status),
    })),
    { label: t({ en: 'Other', fr: 'Autres' }), tasks: tasks.filter((task) => !known.has(task.status)) },
  ].filter((group) => group.tasks.length > 0)
  return (
    <div className={styles.stack}>
      <p className={styles.note}>
        {t(
          {
            en: { one: 'Task board · {{count}} task', other: 'Task board · {{count}} tasks' },
            fr: { one: 'Tableau des tâches · {{count}} tâche', other: 'Tableau des tâches · {{count}} tâches' },
          },
          { count: tasks.length },
        )}
        {gates.length > 0 &&
          ` · ${t({ en: 'Gates', fr: 'Portes' })} : ${gates.map((gate) => `${gate.name} (${requirement(gate)})`).join(', ')}`}
      </p>
      {tasks.length === 0 && <Empty text={{ en: 'No tasks on the board', fr: 'Aucune tâche sur le tableau' }} />}
      {groups.map((group) => (
        <div key={group.label} className={styles.stack}>
          <span className={styles.note}>{`${group.label} · ${group.tasks.length}`}</span>
          {group.tasks.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </div>
      ))}
    </div>
  )
}

function ProjectTasksView({ result, action }: ViewProps) {
  const data = parse(result)
  if (!data) return <Raw result={result} />
  if (action === 'list') return <Board data={data} />
  if (action === 'set_gates') return <GateList gates={(data['gates'] ?? []) as GateView[]} />
  if (action === 'delete' && typeof data['message'] === 'string')
    return <p className={styles.line}>{data['message']}</p>
  if (SINGLE_TASK_ACTIONS.has(action)) return <TaskCard task={parseTaskView(data)} />
  return <Raw result={result} />
}

export const RESULT_VIEWS: Record<string, ComponentType<ViewProps>> = {
  dev_server: DevServerView,
  workspace: WorkspaceView,
  background_process: BackgroundProcessView,
  project_tasks: ProjectTasksView,
}
