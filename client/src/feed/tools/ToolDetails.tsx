import { useDeferredValue, useMemo } from 'react'
import type { Diagnostic, MetadataEntry, PreparingToolCall, ToolCall } from '@shared/types.js'
import { parsePartialFileArgs } from '@shared/partial-tool-args.js'
import { t } from '../../i18n'
import type { ToolStatus } from '../../lib/toolStatus'
import { useApp } from '../../store/app'
import { Markdown } from '../MessageItem'
import { prettyJson } from '../systemText'
import { CodeBlock, DiffView, EditContextView, FilePreview, ImageView, imageSource, readFileCode } from './CodeViews'
import { buildEditorUrl, extractCommand, metadataLabel, parseMetadataArgs } from './parse'
import { detectRemoteCommand, detectRemoteExecution } from './remote-execution'
import { RESULT_VIEWS } from './ResultViews'
import { RunCommand } from './RunCommand'
import styles from './Tools.module.css'

export { detectRemoteCommand, detectRemoteExecution, extractCommand }

const MARKDOWN_RESULT_TOOLS = new Set(['web_search', 'mcp_config'])
const TIMED_TOOLS = new Set(['run_command', 'edit_file', 'write_file', 'read_file', 'describe_image'])
const FILE_TOOLS = new Set(['read_file', 'write_file', 'edit_file'])
const SPECIALIZED = new Set([
  'edit_file',
  'write_file',
  'run_command',
  'read_file',
  'describe_image',
  'return_value',
  'call_sub_agent',
  'web_search',
  'load_skill',
  'web_fetch',
  'mcp_config',
  ...Object.keys(RESULT_VIEWS),
])

function Scrolled({ text, truncated }: { text: string; truncated?: boolean | undefined }) {
  return (
    <>
      <div className={styles.markdown}>
        <Markdown text={text} streaming={false} />
      </div>
      {truncated && <Truncated />}
    </>
  )
}

function Truncated() {
  return <p className={styles.note}>{t({ en: 'Output truncated', fr: 'Sortie tronquée' })}</p>
}

function Label({ text }: { text: string }) {
  return <div className={styles.label}>{text}</div>
}

const SEVERITY_ICONS: Record<Diagnostic['severity'], string> = { error: '✗', warning: '⚠', info: 'i', hint: '·' }

function Diagnostics({ diagnostics }: { diagnostics: Diagnostic[] | undefined }) {
  if (!diagnostics?.length) return null
  const count = (severity: Diagnostic['severity']) => diagnostics.filter((d) => d.severity === severity).length
  const errors = count('error')
  const warnings = count('warning')
  return (
    <div className={styles.frame} data-testid="tool-diagnostics">
      <div className={styles.diagnosticsHeader}>
        <span>{t({ en: 'LSP diagnostics', fr: 'Diagnostics LSP' })}</span>
        {errors > 0 && (
          <span data-severity="error">
            {t(
              {
                en: { one: '{{count}} error', other: '{{count}} errors' },
                fr: { one: '{{count}} erreur', other: '{{count}} erreurs' },
              },
              { count: errors },
            )}
          </span>
        )}
        {warnings > 0 && (
          <span data-severity="warning">
            {t(
              {
                en: { one: '{{count}} warning', other: '{{count}} warnings' },
                fr: { one: '{{count}} avertissement', other: '{{count}} avertissements' },
              },
              { count: warnings },
            )}
          </span>
        )}
      </div>
      {diagnostics.map((diagnostic, index) => (
        <div key={index} className={styles.diagnostic} data-severity={diagnostic.severity}>
          <span>{SEVERITY_ICONS[diagnostic.severity]}</span>
          <div>
            <code>
              {t(
                { en: 'Ln {{line}}:{{column}}', fr: 'L {{line}}:{{column}}' },
                { line: diagnostic.range.start.line + 1, column: diagnostic.range.start.character + 1 },
              )}
              {diagnostic.code !== undefined && ` [${diagnostic.code}]`}
            </code>
            <div>{diagnostic.message}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

function ReadFile({ call }: { call: ToolCall }) {
  const path = String(call.arguments['path'] ?? '')
  const result = call.result?.output
  const image = imageSource(call.result?.metadata)
  if (image) return <ImageView src={image} alt={path} />
  if (!result) return <p className={styles.note}>{t({ en: 'Empty file', fr: 'Fichier vide' })}</p>
  const { code, language, startLine } = readFileCode(result, path)
  if (language === 'markdown') return <Scrolled text={code} truncated={call.result?.truncated} />
  return (
    <div className={`${styles.frame} ${styles.scroll}`}>
      <CodeBlock code={code} language={language} startLine={startLine} />
    </div>
  )
}

function DescribeImage({ call, pending }: { call: ToolCall; pending: boolean }) {
  const metadata = call.result?.metadata
  const question = String(metadata?.['question'] ?? call.arguments['question'] ?? '')
  const image = imageSource(metadata)
  const answer = call.result?.output
  return (
    <div className={styles.stack}>
      {image && <ImageView compact src={image} alt={String(metadata?.['path'] ?? call.arguments['path'] ?? '')} />}
      {question && (
        <div className={styles.question}>
          <Label text={t({ en: 'Question', fr: 'Question' })} />
          {question}
        </div>
      )}
      {pending && (
        <p className={styles.running}>
          {t({ en: 'Asking the vision fallback model…', fr: 'Question au modèle de vision de secours…' })}
        </p>
      )}
      {answer && (
        <div>
          <Label text={t({ en: 'Vision fallback', fr: 'Vision de secours' })} />
          <Scrolled text={answer} />
        </div>
      )}
    </div>
  )
}

function WebFetch({ call }: { call: ToolCall }) {
  const metadata = call.result?.metadata
  const url = String(metadata?.['url'] ?? '')
  return (
    <div className={styles.stack}>
      {/^https?:/i.test(url) && (
        <div className={styles.note}>
          {t({ en: 'Source: ', fr: 'Source : ' })}
          <a href={url} target="_blank" rel="noopener noreferrer">
            {url}
          </a>
          {metadata?.['contentType'] != null && ` (${String(metadata['contentType'])})`}
          {metadata?.['pageCount'] != null &&
            ` · ${t({ en: '{{count}} pages', fr: '{{count}} pages' }, { count: String(metadata['pageCount']) })}`}
        </div>
      )}
      <Scrolled text={call.result?.output ?? ''} truncated={call.result?.truncated} />
    </div>
  )
}

function Generic({ call, status }: { call: ToolCall; status: ToolStatus }) {
  const { arguments: args, result } = call
  return (
    <>
      {Object.keys(args).length > 0 && (
        <div>
          <Label text={t({ en: 'Arguments', fr: 'Arguments' })} />
          <dl className={styles.args}>
            {Object.entries(args).map(([name, value]) => (
              <div key={name}>
                <dt>{name}</dt>
                <dd>{typeof value === 'string' ? value : JSON.stringify(value, null, 2)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      {status === 'success' && result && (
        <div>
          <Label
            text={t({ en: 'Result ({{ms}} ms)', fr: 'Résultat ({{ms}} ms)' }, { ms: Math.round(result.durationMs) })}
          />
          <pre className={styles.output}>
            {result.output ? prettyJson(result.output) : t({ en: 'No output', fr: 'Aucune sortie' })}
          </pre>
          {result.truncated && <Truncated />}
        </div>
      )}
    </>
  )
}

function Body({ call, status }: { call: ToolCall; status: ToolStatus }) {
  const { name, arguments: args, result } = call
  const success = status === 'success'
  const path = args['path'] === undefined ? undefined : String(args['path'])
  const View = RESULT_VIEWS[name]

  switch (name) {
    case 'run_command':
      return (
        <RunCommand
          command={String(args['command'] ?? '')}
          timeoutMs={args['timeout'] as number | undefined}
          startedAt={call.startedAt}
          chunks={call.streamingOutput}
          status={status}
          result={result?.output}
          durationMs={result?.durationMs}
        />
      )
    case 'edit_file':
      if (!success) return null
      return (
        <>
          {result?.editContext?.regions.length ? (
            <EditContextView regions={result.editContext.regions} path={path} />
          ) : (
            <DiffView
              oldString={String(args['old_string'] ?? '')}
              newString={String(args['new_string'] ?? '')}
              path={path}
            />
          )}
          <Diagnostics diagnostics={result?.diagnostics} />
        </>
      )
    case 'write_file':
      if (!success) return null
      return (
        <>
          <FilePreview content={String(args['content'] ?? '')} path={path} />
          <Diagnostics diagnostics={result?.diagnostics} />
        </>
      )
    case 'read_file':
      return success ? <ReadFile call={call} /> : null
    case 'describe_image':
      return success || status === 'pending' ? <DescribeImage call={call} pending={status === 'pending'} /> : null
    case 'return_value': {
      const streamed = call.streamingOutput?.map((chunk) => chunk.content).join('') ?? ''
      return (
        <div>
          <Label text={t({ en: 'Sub-agent summary', fr: 'Résumé du sous-agent' })} />
          <Scrolled text={status === 'pending' && streamed ? streamed : String(args['content'] ?? '')} />
        </div>
      )
    }
    case 'call_sub_agent':
      return (
        <div>
          <Label
            text={`${String(args['subAgentType'] ?? t({ en: 'Sub-agent', fr: 'Sous-agent' }))} · ${t({ en: 'Prompt', fr: 'Invite' })}`}
          />
          <Scrolled text={String(args['prompt'] ?? '')} />
        </div>
      )
    case 'load_skill':
      if (!success) return null
      return (
        <div>
          <Label
            text={t({ en: 'Skill: {{skill}}', fr: 'Compétence : {{skill}}' }, { skill: String(args['skillId'] ?? '') })}
          />
          <Scrolled text={result?.output ?? ''} truncated={result?.truncated} />
        </div>
      )
    case 'web_fetch':
      return success ? <WebFetch call={call} /> : null
  }
  if (MARKDOWN_RESULT_TOOLS.has(name)) {
    return success ? <Scrolled text={result?.output ?? ''} truncated={result?.truncated} /> : null
  }
  if (View)
    return success && result?.output ? <View result={result.output} action={String(args['action'] ?? '')} /> : null
  return SPECIALIZED.has(name) ? null : <Generic call={call} status={status} />
}

function editorLine(call: ToolCall): number | undefined {
  if (call.name === 'edit_file') return call.result?.editContext?.regions[0]?.startLine
  if (call.name !== 'read_file') return undefined
  const match = /^(\d+)[|:]/.exec(call.result?.output ?? '')
  return match ? Number(match[1]) : undefined
}

function Footer({ call, status, remote }: { call: ToolCall; status: ToolStatus; remote: string | null }) {
  const showEditorLink = useApp((state) => state.display['display.showOpenInEditorLinks'] === 'true')
  const remotePrefix = useApp((state) => state.display['editor.vscodeRemotePrefix'] ?? '')
  const durationMs = call.result?.durationMs
  const timed = status === 'success' && durationMs !== undefined && TIMED_TOOLS.has(call.name)
  const path = String(call.result?.metadata?.['path'] ?? call.arguments['path'] ?? '')
  const linkable = showEditorLink && FILE_TOOLS.has(call.name) && path.length > 0
  if (!timed && !remote && !linkable) return null
  return (
    <div className={styles.footer}>
      {timed && (
        <span>{t({ en: 'Completed in {{s}}s', fr: 'Terminé en {{s}} s' }, { s: (durationMs / 1000).toFixed(2) })}</span>
      )}
      <span className={styles.spacer} />
      {linkable && (
        <a href={buildEditorUrl(path, editorLine(call), remotePrefix)}>
          {t({ en: 'Open in VS Code', fr: 'Ouvrir dans VS Code' })}
        </a>
      )}
      {remote && (
        <span className={styles.remote}>
          {t({ en: 'REMOTE · {{protocol}}', fr: 'DISTANT · {{protocol}}' }, { protocol: remote })}
        </span>
      )}
    </div>
  )
}

export function ToolDetails({ call, status, remote }: { call: ToolCall; status: ToolStatus; remote: string | null }) {
  const failure = call.result?.error
  return (
    <div className={styles.body} data-testid="tool-details">
      <Body call={call} status={status} />
      {status === 'error' && failure && <pre className={styles.error}>{failure}</pre>}
      <Footer call={call} status={status} remote={remote} />
    </div>
  )
}

/** Live view of a file tool whose JSON arguments are still streaming. */
export function PreparingPreview({ preparing }: { preparing: PreparingToolCall }) {
  const args = useDeferredValue(preparing.arguments)
  const parsed = useMemo(() => parsePartialFileArgs(args), [args])
  if (!parsed) return null
  let view = null
  if (preparing.name === 'write_file' && parsed.content !== undefined) {
    view = <FilePreview content={parsed.content} path={parsed.path} streaming />
  } else if (preparing.name === 'edit_file' && preparing.editContext?.length) {
    view = <EditContextView regions={preparing.editContext} path={parsed.path} />
  } else if (preparing.name === 'edit_file' && (parsed.old_string !== undefined || parsed.new_string !== undefined)) {
    view = (
      <DiffView oldString={parsed.old_string ?? ''} newString={parsed.new_string ?? ''} path={parsed.path} streaming />
    )
  }
  return view && <div className={styles.body}>{view}</div>
}

const CRITERION_ICONS: Record<string, string> = {
  add: '○',
  update: '○',
  remove: '○',
  complete: '◉',
  pass: '✓',
  fail: '✗',
}

const STATUS_ICONS: Record<string, string> = {
  passed: '✓',
  completed: '◉',
  failed: '✗',
  resolved: '✓',
  dismissed: '–',
  open: '○',
  pending: '○',
  in_progress: '◌',
}

const READ_ACTIONS = new Set(['get', 'list', 'schema'])

function Row({ icon, status, children }: { icon: string; status?: string | undefined; children: React.ReactNode }) {
  return (
    <div className={styles.criterionRow} data-status={status}>
      <span>{icon}</span>
      <div className={styles.grow}>{children}</div>
    </div>
  )
}

function readRows(call: ToolCall) {
  const { result, arguments: args } = call
  if (result && !result.success) {
    return [
      <Row key={call.id} icon="○">
        {result.error ?? t({ en: 'Read failed.', fr: 'Lecture impossible.' })}
      </Row>,
    ]
  }
  if (!result?.output) {
    return [
      <Row key={call.id} icon="○">
        {t({ en: 'No output.', fr: 'Aucune sortie.' })}
      </Row>,
    ]
  }
  if (args['action'] === 'schema') {
    const key = typeof args['key'] === 'string' ? args['key'] : ''
    return [
      <Row key={call.id} icon="✓" status="passed">
        {key
          ? t({ en: 'Schema loaded for “{{key}}”', fr: 'Schéma chargé pour « {{key}} »' }, { key })
          : t({ en: 'Schema loaded.', fr: 'Schéma chargé.' })}
      </Row>,
    ]
  }
  if (args['action'] === 'get') {
    try {
      const entries = JSON.parse(result.output) as unknown
      if (Array.isArray(entries)) {
        return (entries as Array<{ id: string; description: string }>).map((entry, index) => (
          <Row key={`${call.id}-${index}`} icon="○">
            <Markdown text={`[${entry.id}] ${entry.description}`} streaming={false} />
          </Row>
        ))
      }
    } catch {
      // Not JSON: shown as is below
    }
  }
  return [
    <Row key={call.id} icon="○">
      <Markdown text={result.output} streaming={false} />
    </Row>,
  ]
}

function ItemRow({ call, entries }: { call: ToolCall; entries: MetadataEntry[] }) {
  const args = call.arguments
  const action = String(args['action'] ?? '')
  const id = typeof args['id'] === 'string' ? args['id'] : undefined
  const metadata = call.name === 'session_metadata'
  const removed = action === 'remove'
  const reason = typeof args['reason'] === 'string' ? args['reason'] : undefined
  const text =
    (typeof args['description'] === 'string' ? args['description'] : undefined) ??
    entries.find((entry) => entry.id === id)?.description ??
    (removed && id
      ? `[${id}]`
      : metadata
        ? t({ en: 'Item updated', fr: 'Élément mis à jour' })
        : t({ en: 'Criterion updated', fr: 'Critère mis à jour' }))
  const status = metadata ? String(args['status'] ?? '') : action
  const icon = (metadata ? STATUS_ICONS[status] : CRITERION_ICONS[action]) ?? '○'
  return (
    <Row icon={icon} status={status}>
      <div className={removed ? styles.struck : undefined}>
        <Markdown text={text} streaming={false} />
      </div>
      {reason && <div className={styles.reason} data-failed={action === 'fail' || undefined}>{`└ “${reason}”`}</div>}
    </Row>
  )
}

const NO_ENTRIES: MetadataEntry[] = []

export function CriteriaGroup({ calls, preparing }: { calls: ToolCall[]; preparing: PreparingToolCall[] }) {
  const entries = useApp((state) => state.session?.metadataEntries?.['criteria'] ?? NO_ENTRIES)
  const adds = preparing.flatMap((item) => {
    const parsed = parseMetadataArgs(item.arguments)
    return parsed ? [{ item, parsed }] : []
  })
  const metadata = calls.some((call) => call.name === 'session_metadata') || adds.length > 0
  const keys = new Set(
    [...calls.map((call) => call.arguments['key'] as string | undefined), ...adds.map((add) => add.parsed.key)].filter(
      Boolean,
    ),
  )
  const onlyKey = keys.size === 1 ? [...keys][0] : undefined
  const title = !metadata
    ? t({ en: 'Acceptance criteria', fr: 'Critères d’acceptation' })
    : onlyKey === 'criteria'
      ? t({ en: 'Acceptance criteria', fr: 'Critères d’acceptation' })
      : onlyKey === 'todos'
        ? t({ en: 'Tasks', fr: 'Tâches' })
        : onlyKey
          ? metadataLabel(onlyKey)
          : t({ en: 'Session data', fr: 'Données de session' })

  return (
    <div className={styles.criteria} data-testid="criteria-group">
      <div className={styles.criteriaTitle}>{title}</div>
      {calls.flatMap((call) =>
        READ_ACTIONS.has(String(call.arguments['action']))
          ? readRows(call)
          : [<ItemRow key={call.id} call={call} entries={entries} />],
      )}
      {adds.map(({ item, parsed }) => (
        <Row key={`preparing-${item.index}`} icon="○" status="streaming">
          <Markdown text={parsed.description ?? ''} streaming />
        </Row>
      ))}
    </div>
  )
}
