import type { PluginActivation } from '@shared/plugin.js'
import { reloadProviders, reloadSessionLists, showSettings } from '../controller'
import { rpcContext, type PluginContext } from './core'
import { applyPanelContent, clearPanelValues, invokePluginRpc, pushToast, setPluginValue, usePlugins } from './store'

function openExternal(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer')
}

function applyRpcResult(pluginId: string, result: Record<string, unknown>, context: PluginContext): void {
  const openPanel = result['openPanel']
  if (typeof openPanel === 'string') {
    const skipInit = Array.isArray(result['content']) || Array.isArray(result['nodes'])
    usePlugins.setState({ activePanel: { pluginId, panelId: openPanel, context: rpcContext(context), skipInit } })
    applyPanelContent(pluginId, openPanel, result)
  } else {
    const active = usePlugins.getState().activePanel
    const targetId =
      active?.pluginId === pluginId ? active.panelId : ((context['tabId'] as string | undefined) ?? context.tab)
    if (targetId) applyPanelContent(pluginId, targetId, result)
    else if (result['content'] && typeof result['content'] === 'object')
      setPluginValue(pluginId, 'content', 'content', result['content'])
  }
  if (Array.isArray(result['invalidate'])) void reloadSessionLists()
  const challenge = result['challenge'] as { directUrl?: string; verificationUrl?: string; url?: string } | undefined
  const target = challenge ? (challenge.directUrl ?? challenge.verificationUrl ?? challenge.url) : result['url']
  if (typeof target === 'string') openExternal(target)
}

export async function activatePluginAction(
  pluginId: string | undefined,
  activation: PluginActivation | undefined,
  context: PluginContext = {},
): Promise<void> {
  if (!pluginId || !activation) return
  try {
    switch (activation.kind) {
      case 'rpc': {
        const params = {
          ...activation.params,
          ...(context['fieldId'] ? { fieldId: context['fieldId'] } : {}),
          ...(context['value'] !== undefined ? { value: context['value'] } : {}),
          ...(context['modelId'] ? { modelId: context['modelId'] } : {}),
          ...(context['providerId'] ? { providerId: context['providerId'] } : {}),
        }
        const result = await invokePluginRpc(pluginId, activation.method, params, context)
        if (result && typeof result === 'object') applyRpcResult(pluginId, result as Record<string, unknown>, context)
        void reloadProviders()
        return
      }
      case 'openPanel':
        usePlugins.setState({
          activePanel: { pluginId, panelId: activation.panelId, context: rpcContext(context), skipInit: false },
        })
        return
      case 'closePanel': {
        const active = usePlugins.getState().activePanel
        if (active) clearPanelValues(active.pluginId, active.panelId)
        usePlugins.setState({ activePanel: null })
        return
      }
      case 'openSettings':
        usePlugins.setState({ activePanel: null })
        showSettings(activation.tab)
        return
      default:
        openExternal(activation.url)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    pushToast({
      id: `plugin-error-${Date.now()}`,
      pluginId,
      title: { en: 'Plugin action failed', fr: 'Échec de l’action du plugin' },
      body: { en: message, fr: message },
      level: 'error',
      createdAt: new Date().toISOString(),
    })
  }
}
