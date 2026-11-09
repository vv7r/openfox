import type { Translation } from '@shared/i18n/index.js'

export interface McpTool {
  name: string
  description?: string
  estimatedTokens: number
  enabled: boolean
}

export interface McpConfig {
  transport?: string
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
  oauth?: boolean
  timeout?: number
  disabled?: boolean
}

export interface McpServer {
  name: string
  status: string
  tools: McpTool[]
  estimatedTokens: number
  error?: string
  config: McpConfig
}

export interface McpForm {
  name: string
  transport: 'stdio' | 'http'
  command: string
  args: string
  env: string
  url: string
  headers: string
  oauth: boolean
  timeout: string
}

export function emptyMcpForm(): McpForm {
  return {
    name: '',
    transport: 'stdio',
    command: '',
    args: '',
    env: '',
    url: '',
    headers: '',
    oauth: false,
    timeout: '',
  }
}

const toLines = (values: Record<string, string> | undefined) =>
  Object.entries(values ?? {})
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')

export function mcpFormFrom(server: Pick<McpServer, 'name' | 'config'>): McpForm {
  const { config } = server
  return {
    name: server.name,
    transport: config.transport === 'http' ? 'http' : 'stdio',
    command: config.command ?? '',
    args: config.args?.join(' ') ?? '',
    env: toLines(config.env),
    url: config.url ?? '',
    headers: toLines(config.headers),
    oauth: config.oauth ?? false,
    timeout: config.timeout === undefined ? '' : String(config.timeout),
  }
}

export function parseKeyValues(text: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const separator = line.indexOf('=')
    if (separator > 0) result[line.slice(0, separator).trim()] = line.slice(separator + 1).trim()
  }
  return result
}

export function validateMcpForm(form: McpForm, adding: boolean): Translation | null {
  if (adding && !form.name.trim()) return { en: 'Name is required', fr: 'Le nom est requis' }
  if (form.transport === 'stdio' && !form.command.trim()) {
    return { en: 'Command is required for stdio transport', fr: 'La commande est requise pour le transport stdio' }
  }
  if (form.transport === 'http' && !form.url.trim()) {
    return { en: 'URL is required for HTTP transport', fr: 'L’URL est requise pour le transport HTTP' }
  }
  if (form.timeout) {
    const timeout = Number(form.timeout)
    if (Number.isNaN(timeout) || timeout <= 0) {
      return { en: 'Timeout must be a positive number', fr: 'Le délai d’expiration doit être un nombre positif' }
    }
  }
  return null
}

export function mcpBody(form: McpForm, includeName: boolean): Record<string, unknown> {
  return {
    ...(includeName ? { name: form.name.trim() } : {}),
    transport: form.transport,
    ...(form.transport === 'stdio'
      ? { command: form.command.trim(), args: form.args.split(/\s+/).filter(Boolean), env: parseKeyValues(form.env) }
      : { url: form.url.trim(), headers: parseKeyValues(form.headers), oauth: form.oauth }),
    ...(form.timeout ? { timeout: Number(form.timeout) } : {}),
  }
}
