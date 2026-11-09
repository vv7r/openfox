import { NO_FOLD } from '../../markdown/render'
import type { EditContextRegion, PreparingToolCall } from '@shared/types.js'

export interface AnsiSegment {
  text: string
  color?: number
  background?: number
  bold?: boolean
  dim?: boolean
  italic?: boolean
  underline?: boolean
}

type AnsiStyle = Omit<AnsiSegment, 'text'>

// eslint-disable-next-line no-control-regex -- matching terminal escapes is the point
const ANSI_SEQUENCE = /\x1b\[([0-9;?]*)([ -/]*[@-~])/g

function applySgr(style: AnsiStyle, codes: number[]): AnsiStyle {
  let next = style
  const without = (key: keyof AnsiStyle) => {
    const copy = { ...next }
    delete copy[key]
    return copy
  }
  for (const code of codes) {
    if (code === 0) next = {}
    else if (code === 1) next = { ...next, bold: true }
    else if (code === 2) next = { ...next, dim: true }
    else if (code === 3) next = { ...next, italic: true }
    else if (code === 4) next = { ...next, underline: true }
    else if (code === 22) {
      next = without('bold')
      next = without('dim')
    } else if (code === 23) next = without('italic')
    else if (code === 24) next = without('underline')
    else if (code === 39) next = without('color')
    else if (code === 49) next = without('background')
    else if ((code >= 30 && code <= 37) || (code >= 90 && code <= 97)) next = { ...next, color: code }
    else if ((code >= 40 && code <= 47) || (code >= 100 && code <= 107)) next = { ...next, background: code }
  }
  return next
}

/** Splits terminal output into styled runs; escapes other than colors just disappear. */
export function parseAnsi(input: string): AnsiSegment[] {
  const segments: AnsiSegment[] = []
  let style: AnsiStyle = {}
  let at = 0

  const push = (text: string) => {
    if (!text) return
    const last = segments[segments.length - 1]
    if (last && JSON.stringify({ ...last, text: '' }) === JSON.stringify({ ...style, text: '' })) last.text += text
    else segments.push({ text, ...style })
  }

  for (const match of input.matchAll(ANSI_SEQUENCE)) {
    push(input.slice(at, match.index))
    at = match.index + match[0].length
    if (match[2] === 'm') style = applySgr(style, (match[1] || '0').split(';').map(Number))
  }
  push(input.slice(at))
  return segments
}

/** Code as a fenced block, safe whatever backticks it contains. */
export function fencedCode(code: string, language: string): string {
  const longest = Math.max(2, ...Array.from(code.matchAll(/`+/g), (match) => match[0].length))
  const fence = '`'.repeat(longest + 1)
  return `${fence}${language} ${NO_FOLD}\n${code}\n${fence}`
}

export function stripReadNumbers(content: string): string {
  return content
    .split('\n')
    .filter((line) => !line.startsWith('['))
    .map((line) => line.replace(/^\d+\|/, ''))
    .join('\n')
}

export function readFileStartLine(content: string): number {
  const match = /^(\d+)\|/.exec(content)
  return match ? Number(match[1]) : 1
}

export interface Section {
  type: 'context' | 'removed' | 'added'
  startLine: number
  lines: string[]
}

export function groupSections(region: EditContextRegion): Section[] {
  const sections: Section[] = []
  const push = (type: Section['type'], line: number, content: string) => {
    const last = sections[sections.length - 1]
    if (last && last.type === type && last.startLine + last.lines.length === line) last.lines.push(content)
    else sections.push({ type, startLine: line, lines: [content] })
  }
  region.beforeContext.forEach((line) => push('context', line.lineNumber, line.content))
  for (const edit of region.edits) {
    edit.oldContent.split('\n').forEach((line, index) => push('removed', edit.startLine + index, line))
    edit.newContent.split('\n').forEach((line, index) => push('added', edit.startLine + index, line))
  }
  region.afterContext.forEach((line) => push('context', line.lineNumber, line.content))
  return sections
}

export function extractCommand(args: string): string | null {
  try {
    const parsed = JSON.parse(args) as { command?: unknown }
    return typeof parsed.command === 'string' ? parsed.command : null
  } catch {
    return /"command"\s*:\s*"([^"]*)/.exec(args)?.[1] ?? null
  }
}

export interface MetadataArgs {
  action?: string
  key?: string
  id?: string
  description?: string
}

const METADATA_FIELDS = ['action', 'key', 'id', 'description'] as const

/** Works on the partial JSON of a call still streaming. */
export function parseMetadataArgs(args: string | undefined): MetadataArgs | null {
  if (!args) return null
  const result: MetadataArgs = {}
  try {
    const parsed = JSON.parse(args) as Record<string, unknown>
    for (const field of METADATA_FIELDS) {
      const value = parsed[field]
      if (typeof value === 'string') result[field] = value
    }
  } catch {
    for (const field of METADATA_FIELDS) {
      const value = new RegExp(`"${field}"\\s*:\\s*"([^"]*)`).exec(args)?.[1]
      if (value) result[field] = value
    }
  }
  return Object.keys(result).length > 0 ? result : null
}

export function isMetadataPreparing(preparing: PreparingToolCall): boolean {
  if (preparing.name !== 'session_metadata') return false
  const parsed = parseMetadataArgs(preparing.arguments)
  return parsed?.action === 'add' && Boolean(parsed.key)
}

export function metadataLabel(key: string): string {
  return key
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export interface TaskViewGate {
  gateId: string
  value: string
}

export interface TaskView {
  id: string
  prompt: string
  status: string
  runState?: string
  queuePosition?: number
  boundSession?: string
  model?: string
  attachments?: number
  gates: TaskViewGate[]
}

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}

const asText = (value: unknown): string => (typeof value === 'string' ? value : '')

function parseGates(raw: unknown): TaskViewGate[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((entry) => {
    const record = asRecord(entry)
    const gateId = Object.keys(record).find((key) => key !== 'actor' && key !== 'timestamp')
    const value = gateId ? record[gateId] : undefined
    return gateId && typeof value === 'string' ? [{ gateId, value }] : []
  })
}

export function parseTaskView(raw: unknown): TaskView {
  const record = asRecord(raw)
  const optional = (key: string) => (asText(record[key]) ? { [key]: asText(record[key]) } : {})
  return {
    id: asText(record['id']),
    prompt: asText(record['prompt']),
    status: asText(record['status']),
    ...optional('runState'),
    ...optional('boundSession'),
    ...optional('model'),
    ...(typeof record['queuePosition'] === 'number' ? { queuePosition: record['queuePosition'] } : {}),
    ...(typeof record['attachments'] === 'number' ? { attachments: record['attachments'] } : {}),
    gates: parseGates(record['gateValues']),
  }
}

export function buildEditorUrl(path: string, line: number | undefined, remotePrefix: string): string {
  const encoded = encodeURI(path.replace(/\\/g, '/')).replace(/#/g, '%23').replace(/\?/g, '%3F')
  const remote = remotePrefix.trim().replace(/\/+$/, '')
  const base = remote ? `vscode://${remote}${encoded}` : `vscode://file/${encoded}`
  return `${base}:${line ?? 1}:1?windowId=_blank`
}
