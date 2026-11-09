import { getLocale } from '@shared/i18n/index.js'
import type {
  LocalizedString,
  PluginSettingsField,
  PluginSettingsLinkButton,
  PluginVisibilityCondition,
} from '@shared/plugin.js'

export type PluginContext = {
  sessionId?: string
  workdir?: string
  projectId?: string
  messageId?: string
  tab?: string
  [key: string]: unknown
}

export const MASKED_SECRET = '••••••••••••••••'

export function localize(value: LocalizedString | string | undefined): string {
  if (value === undefined) return ''
  if (typeof value === 'string') return value
  return value[getLocale()] ?? value.en
}

export function interpolate(text: unknown, values?: Record<string, unknown>): string {
  if (text === null || text === undefined) return ''
  const source = String(text)
  if (!values) return source
  return source.replace(/\{\{(\w+)\}\}/g, (match, key: string) => (key in values ? String(values[key]) : match))
}

export function isContributionVisible(
  condition: PluginVisibilityCondition | undefined,
  context: PluginContext,
): boolean {
  if (!condition) return true
  if (condition.hasProject !== undefined && Boolean(context.projectId) !== condition.hasProject) return false
  if (condition.hasSession !== undefined && Boolean(context.sessionId) !== condition.hasSession) return false
  if (condition.hasMessage !== undefined && Boolean(context.messageId) !== condition.hasMessage) return false
  if (condition.eq && Object.entries(condition.eq).some(([key, expected]) => context[key] !== expected)) return false
  if (condition.neq && Object.entries(condition.neq).some(([key, expected]) => context[key] === expected)) return false
  return true
}

export function extractScopedValues(
  published: Record<string, unknown>,
  pluginId: string,
  targetId?: string,
): Record<string, unknown> {
  const values: Record<string, unknown> = {}
  const collect = (prefix: string) => {
    for (const [key, value] of Object.entries(published)) {
      if (key.startsWith(prefix)) values[key.slice(prefix.length)] = value
    }
  }
  collect(`${pluginId}::`)
  if (targetId) collect(`${pluginId}:${targetId}:`)
  return values
}

export function rpcContext(context: PluginContext): { sessionId?: string; workdir?: string; projectId?: string } {
  return {
    ...(typeof context.sessionId === 'string' ? { sessionId: context.sessionId } : {}),
    ...(typeof context.workdir === 'string' ? { workdir: context.workdir } : {}),
    ...(typeof context.projectId === 'string' ? { projectId: context.projectId } : {}),
    ...(typeof context['projectName'] === 'string' ? { projectName: context['projectName'] } : {}),
  }
}

const isSecret = (field: PluginSettingsField) => field.secret === true || field.type === 'password'
const isDisplayOnly = (field: PluginSettingsField) =>
  field.type === 'button' || field.type === 'status' || field.readOnly === true

export type FieldValue = string | number | boolean

export function initialFieldValue(
  field: PluginSettingsField,
  stored: Record<string, unknown>,
  secretsSet: string[],
): FieldValue {
  if (field.type === 'button' || field.type === 'status') return ''
  if (field.readOnly) return (field.default as string) ?? ''
  if (isSecret(field) && secretsSet.includes(field.key)) return MASKED_SECRET
  const value = stored[field.key]
  if (field.type === 'boolean') return typeof value === 'boolean' ? value : ((field.default as boolean) ?? false)
  if (field.type === 'number') return typeof value === 'number' ? value : ((field.default as number) ?? '')
  if (typeof value === 'string') return value
  if (field.type === 'list') return typeof field.default === 'string' ? field.default : '[]'
  return (field.default as string) ?? ''
}

/** What to save: secrets are only sent when a new value was actually typed. */
export function buildSettingsPayload(
  fields: PluginSettingsField[],
  values: Record<string, FieldValue | undefined>,
): Record<string, FieldValue> {
  const payload: Record<string, FieldValue> = {}
  for (const field of fields) {
    if (isDisplayOnly(field)) continue
    const value = values[field.key]
    if (value === undefined) continue
    if (isSecret(field) && (value === MASKED_SECRET || /^[•*]+$/.test(String(value)) || value === '')) continue
    if (field.type === 'number' && value === '') continue
    payload[field.key] = value
  }
  return payload
}

export function resolveLinkHref(link: PluginSettingsLinkButton, values: Record<string, unknown>): string {
  const selected = link.hrefByField ? String(values[link.hrefByField] ?? '') : ''
  const template = link.hrefByValue?.[selected] ?? link.href ?? ''
  return template.replace(/\{\{\s*([\w.-]+?)\s*\}\}/g, (_match, placeholder: string) => {
    const [key, accessor] = placeholder.split('.')
    const raw = values[key ?? '']
    const value = raw === undefined || raw === null ? '' : String(raw)
    if (accessor !== 'origin') return value
    try {
      return new URL(value).origin
    } catch {
      return ''
    }
  })
}
