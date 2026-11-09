import { useEffect, useMemo } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { DeclarativeNode } from '@shared/plugin.js'
import { readToken } from '../api'
import { t } from '../i18n'
import { extractScopedValues, localize, type PluginContext } from './core'
import { DeclarativeRenderer } from './Render'
import {
  applyPanelContent,
  clearPanelValues,
  dismissToast,
  invokePluginRpc,
  usePlugins,
  type ActivePanel,
} from './store'
import styles from './Plugin.module.css'

const TOAST_MS = 6000

function iframeSrc(pluginId: string, url: string, context: PluginContext): string {
  if (/^https?:\/\//.test(url))
    return `/api/plugins/${encodeURIComponent(pluginId)}/proxy?url=${encodeURIComponent(url)}`
  const params = new URLSearchParams()
  const token = readToken()
  if (token) params.set('token', token)
  for (const key of ['sessionId', 'projectId', 'workdir'] as const) {
    const value = context[key]
    if (value) params.set(key, value)
  }
  const query = params.toString()
  return `/api/plugins/${encodeURIComponent(pluginId)}/assets/${url.replace(/^\//, '')}${query ? `?${query}` : ''}`
}

function Panel({ active }: { active: ActivePanel }) {
  const panels = usePlugins((state) => state.contributions.panels)
  const published = usePlugins((state) => state.values)
  const panel = useMemo(
    () =>
      panels.find(
        (p) => p.id === active.panelId && (!p.pluginId || p.pluginId === 'unknown' || p.pluginId === active.pluginId),
      ),
    [panels, active],
  )
  const pluginId = panel?.pluginId && panel.pluginId !== 'unknown' ? panel.pluginId : active.pluginId

  useEffect(() => {
    if (active.skipInit) return
    let live = true
    void invokePluginRpc(pluginId, 'initPanel', { panelId: active.panelId }, active.context)
      .then((result) => {
        if (live) applyPanelContent(pluginId, active.panelId, result)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [active, pluginId])

  if (!panel) return null
  const close = () => {
    clearPanelValues(active.pluginId, active.panelId)
    usePlugins.setState({ activePanel: null })
  }
  const values = extractScopedValues(published, pluginId, active.panelId)
  const context = { ...active.context, pluginId }
  const content = Array.isArray(values['content']) ? (values['content'] as DeclarativeNode[]) : (panel.content ?? [])
  const footer = Array.isArray(values['footer']) ? (values['footer'] as DeclarativeNode[]) : (panel.footer ?? [])
  const draw = (nodes: DeclarativeNode[]) =>
    nodes.map((node, index) => (
      <DeclarativeRenderer
        key={'id' in node && node.id ? `f-${node.id}` : `${index}-${node.type}`}
        node={node}
        values={values}
        context={context}
      />
    ))

  return (
    <Dialog.Root open onOpenChange={(open) => !open && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content
          className={styles.dialog}
          data-size={panel.size ?? 'md'}
          data-testid="plugin-panel"
          aria-describedby={undefined}
        >
          <div className={styles.dialogHeader}>
            <Dialog.Title className={styles.dialogTitle}>{localize(panel.title)}</Dialog.Title>
            <Dialog.Close className={styles.close} aria-label={t({ en: 'Close', fr: 'Fermer' })}>
              <X size={16} />
            </Dialog.Close>
          </div>
          <div className={styles.dialogBody}>
            {panel.kind === 'iframe' && panel.url ? (
              <iframe
                title={localize(panel.title)}
                src={iframeSrc(pluginId, panel.url, active.context)}
                sandbox="allow-scripts allow-forms"
                className={styles.panelFrame}
              />
            ) : (
              draw(content)
            )}
          </div>
          {footer.length > 0 && <div className={styles.dialogFooter}>{draw(footer)}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function Toast({ id, title, body, level }: { id: string; title: string; body: string; level: string | undefined }) {
  useEffect(() => {
    const timer = setTimeout(() => dismissToast(id), TOAST_MS)
    return () => clearTimeout(timer)
  }, [id])
  return (
    <div className={styles.toast} data-level={level} role="status">
      <strong>{title}</strong>
      {body && <div>{body}</div>}
      <button type="button" aria-label={t({ en: 'Dismiss', fr: 'Fermer' })} onClick={() => dismissToast(id)}>
        <X size={13} />
      </button>
    </div>
  )
}

export default function PluginHost() {
  const active = usePlugins((state) => state.activePanel)
  const toasts = usePlugins((state) => state.toasts)
  return (
    <>
      {active && <Panel key={`${active.pluginId}:${active.panelId}`} active={active} />}
      {toasts.length > 0 && (
        <div className={styles.toasts}>
          {toasts.map((toast) => (
            <Toast
              key={toast.id}
              id={toast.id}
              title={localize(toast.title)}
              body={localize(toast.body)}
              level={toast.level}
            />
          ))}
        </div>
      )}
    </>
  )
}
