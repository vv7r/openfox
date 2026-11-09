import { create } from 'zustand'
import type { ServerMessage } from '@shared/protocol.js'
import type { DeclarativeNode, PluginNotification, PluginUiContributions } from '@shared/plugin.js'
import { getJson, sendJson } from '../api'
import { useApp } from '../store/app'
import { rpcContext, type PluginContext } from './core'

export interface PluginEntry {
  id: string
  displayName: string
  description?: string
  version?: string
  enabled: boolean
  removable?: boolean
  icon?: string
  logo?: string
}

export interface ActivePanel {
  pluginId: string
  panelId: string
  context: PluginContext
  skipInit: boolean
}

export interface PluginState {
  plugins: PluginEntry[]
  contributions: PluginUiContributions
  values: Record<string, unknown>
  activePanel: ActivePanel | null
  toasts: PluginNotification[]
}

const EMPTY: PluginUiContributions = {
  actions: [],
  badges: [],
  panels: [],
  sections: [],
  settingsTabs: [],
  components: [],
  overrides: [],
  dangerLevels: [],
}

export const usePlugins = create<PluginState>(() => ({
  plugins: [],
  contributions: EMPTY,
  values: {},
  activePanel: null,
  toasts: [],
}))

export async function loadPlugins(): Promise<void> {
  const data = await getJson<{ plugins: PluginEntry[]; contributions: PluginUiContributions }>('/api/plugins/list')
  usePlugins.setState({ plugins: data.plugins, contributions: { ...EMPTY, ...data.contributions } })
}

export function setPluginValue(pluginId: string, panelId: string | undefined, key: string, value: unknown): void {
  usePlugins.setState((state) => ({ values: { ...state.values, [`${pluginId}:${panelId ?? ''}:${key}`]: value } }))
}

export function clearPanelValues(pluginId: string, panelId: string): void {
  const prefix = `${pluginId}:${panelId}:`
  usePlugins.setState((state) => ({
    values: Object.fromEntries(Object.entries(state.values).filter(([key]) => !key.startsWith(prefix))),
  }))
}

export function pushToast(toast: PluginNotification): void {
  usePlugins.setState((state) => ({ toasts: [...state.toasts, toast] }))
}

export function dismissToast(id: string): void {
  usePlugins.setState((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }))
}

export async function invokePluginRpc(
  pluginId: string,
  method: string,
  params: Record<string, unknown>,
  context: PluginContext,
): Promise<unknown> {
  const response = await sendJson(
    `/api/plugins/${encodeURIComponent(pluginId)}/rpc/${encodeURIComponent(method)}`,
    'POST',
    { params, ...rpcContext(context) },
  )
  const body = (await response.json()) as { result?: unknown; error?: string }
  if (!response.ok) throw new Error(body.error ?? `Plugin RPC failed (${response.status})`)
  return body.result
}

export function applyPanelContent(pluginId: string, targetId: string, result: unknown): void {
  if (!result || typeof result !== 'object') return
  const body = result as Record<string, unknown>
  const content = Array.isArray(body['content'])
    ? (body['content'] as DeclarativeNode[])
    : Array.isArray(body['nodes'])
      ? (body['nodes'] as DeclarativeNode[])
      : body['content'] && typeof body['content'] === 'object'
        ? [body['content'] as DeclarativeNode]
        : undefined
  if (Array.isArray(body['footer'])) setPluginValue(pluginId, targetId, 'footer', body['footer'])
  if (content) setPluginValue(pluginId, targetId, 'content', content)
}

export function handlePluginMessage(message: ServerMessage): void {
  switch (message.type) {
    case 'plugin.notification': {
      const payload = message.payload as { notification: PluginNotification; unreadCount: number }
      useApp.setState({ unreadNotifications: payload.unreadCount })
      pushToast(payload.notification)
      return
    }
    case 'plugin.notification_read':
      useApp.setState({ unreadNotifications: (message.payload as { unreadCount: number }).unreadCount })
      return
    case 'plugin.ui_state': {
      const payload = message.payload as { pluginId: string; panelId?: string; key: string; value: unknown }
      setPluginValue(payload.pluginId, payload.panelId, payload.key, payload.value)
      return
    }
    default:
  }
}
