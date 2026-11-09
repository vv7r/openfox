import { Component, useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from 'react'
import type {
  DeclarativeNode,
  PluginUiAction,
  PluginUiBadge,
  PluginUiBadgeDynamicState,
  PluginUiComponent,
  PluginUiContentSource,
  PluginUiOverride,
  PluginZoneId,
} from '@shared/plugin.js'
import { activatePluginAction } from './activate'
import {
  extractScopedValues,
  interpolate,
  isContributionVisible,
  localize,
  rpcContext,
  type PluginContext,
} from './core'
import { PluginIcon } from './Icon'
import { invokePluginRpc, usePlugins } from './store'
import styles from './Plugin.module.css'

type RenderContext = PluginContext & { pluginId?: string }

export function ActionButtons({ actions, context }: { actions: PluginUiAction[]; context: PluginContext }) {
  return (
    <>
      {actions.map((action) => (
        <button
          key={`${action.pluginId}:${action.id}`}
          type="button"
          className={styles.action}
          data-variant={action.variant ?? 'default'}
          title={localize(action.tooltip ?? action.label)}
          onClick={() => void activatePluginAction(action.pluginId, action.onActivate, context)}
        >
          <PluginIcon name={action.icon} />
          <span>{localize(action.label)}</span>
        </button>
      ))}
    </>
  )
}

const MIN_BADGE_REFRESH_MS = 250

function PluginBadgeView({ badge, context }: { badge: PluginUiBadge; context: PluginContext }) {
  const [resolved, setResolved] = useState<{
    value?: string | number
    dynamic?: PluginUiBadgeDynamicState
    loaded: boolean
  }>({ loaded: badge.source === undefined })
  const { sessionId, workdir, projectId } = context

  useEffect(() => {
    if (!badge.source || !badge.pluginId) return
    let active = true
    const load = () =>
      invokePluginRpc(
        badge.pluginId!,
        badge.source!.method,
        {},
        { ...(sessionId ? { sessionId } : {}), ...(workdir ? { workdir } : {}), ...(projectId ? { projectId } : {}) },
      )
        .then((result) => {
          if (!active) return
          if (typeof result === 'string' || typeof result === 'number') setResolved({ value: result, loaded: true })
          else if (result && typeof result === 'object')
            setResolved({ dynamic: result as PluginUiBadgeDynamicState, loaded: true })
          else setResolved({ loaded: true })
        })
        .catch(() => {})
    void load()
    const interval = badge.source.refreshMs
      ? window.setInterval(() => void load(), Math.max(MIN_BADGE_REFRESH_MS, badge.source.refreshMs))
      : undefined
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [badge.pluginId, badge.source, sessionId, workdir, projectId])

  const dynamic = resolved.dynamic
  if ((badge.source && !resolved.loaded && badge.value === undefined) || dynamic?.visible === false) return null
  const tone = dynamic?.tone ?? badge.tone ?? 'neutral'
  const label = localize(dynamic?.label ?? badge.label)
  const tooltip = localize(dynamic?.tooltip ?? badge.tooltip ?? dynamic?.label ?? badge.label)
  const value = dynamic?.value ?? resolved.value ?? badge.value
  const icon = dynamic?.icon ?? badge.icon

  if (badge.appearance === 'icon') {
    return (
      <span className={styles.iconBadge} data-tone={tone} title={tooltip} data-testid="plugin-badge">
        {icon ? <PluginIcon name={icon} size={12} /> : (value ?? label)}
      </span>
    )
  }
  const hasValue = value !== undefined && value !== ''
  return (
    <span className={styles.badge} data-tone={tone} title={tooltip} data-testid="plugin-badge">
      {icon && <PluginIcon name={icon} size={12} />}
      {hasValue ? (label ? `${label} ${String(value)}` : String(value)) : label}
    </span>
  )
}

export function BadgeList({ badges, context }: { badges: PluginUiBadge[]; context: PluginContext }) {
  return (
    <>
      {badges.map((badge) => (
        <PluginBadgeView key={`${badge.pluginId}:${badge.id}`} badge={badge} context={context} />
      ))}
    </>
  )
}

function useBoundField(
  external: string,
): [string, (next: string) => void, { onFocus: () => void; onBlur: () => void }] {
  const [value, setValue] = useState(external)
  const [focused, setFocused] = useState(false)
  // Never overwrite what the user is typing; the latest value applies on blur
  useEffect(() => {
    if (!focused) setValue(external)
  }, [external, focused])
  return [value, setValue, { onFocus: () => setFocused(true), onBlur: () => setFocused(false) }]
}

function TextField({
  node,
  values,
  context,
}: {
  node: Extract<DeclarativeNode, { type: 'input' }>
  values: Record<string, unknown>
  context: RenderContext
}) {
  const [value, setValue, focus] = useBoundField(interpolate(node.defaultValue ?? '', values))
  const fire = (action: typeof node.onChange, next: string) => {
    if (action) void activatePluginAction(context.pluginId, action, { ...context, fieldId: node.id, value: next })
  }
  const shared = {
    id: node.id,
    className: styles.input,
    disabled: node.disabled,
    value,
    placeholder: node.placeholder ? localize(node.placeholder) : undefined,
    onFocus: focus.onFocus,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setValue(event.target.value)
      fire(node.onChange, event.target.value)
    },
    onBlur: (event: { target: { value: string } }) => {
      focus.onBlur()
      fire(node.onBlur, event.target.value)
    },
  }
  return (
    <div className={styles.field}>
      {node.label && <label htmlFor={node.id}>{localize(node.label)}</label>}
      {node.inputType === 'textarea' ? (
        <textarea rows={Math.min(Math.max(node.rows ?? 2, value.split('\n').length), 15)} {...shared} />
      ) : (
        <input type={node.inputType ?? 'text'} {...shared} />
      )}
    </div>
  )
}

function CheckField({
  node,
  values,
  context,
}: {
  node: Extract<DeclarativeNode, { type: 'input' }>
  values: Record<string, unknown>
  context: RenderContext
}) {
  const raw = values[node.id]
  const external = raw !== undefined ? raw === true || raw === 'true' : Boolean(node.defaultChecked)
  const [checked, setChecked] = useState(external)
  useEffect(() => setChecked(external), [external])
  return (
    <label className={styles.check}>
      <input
        id={node.id}
        type="checkbox"
        disabled={node.disabled}
        checked={checked}
        onChange={(event) => {
          setChecked(event.target.checked)
          if (node.onChange)
            void activatePluginAction(context.pluginId, node.onChange, {
              ...context,
              fieldId: node.id,
              value: String(event.target.checked),
            })
        }}
      />
      {node.label && localize(node.label)}
    </label>
  )
}

function SelectField({
  node,
  values,
  context,
}: {
  node: Extract<DeclarativeNode, { type: 'select' }>
  values: Record<string, unknown>
  context: RenderContext
}) {
  const [value, setValue, focus] = useBoundField(interpolate(node.defaultValue ?? '', values))
  return (
    <div className={styles.field}>
      {node.label && <label htmlFor={node.id}>{localize(node.label)}</label>}
      <select
        id={node.id}
        className={styles.input}
        value={value}
        {...focus}
        onChange={(event) => {
          setValue(event.target.value)
          if (node.onChange)
            void activatePluginAction(context.pluginId, node.onChange, {
              ...context,
              fieldId: node.id,
              value: event.target.value,
            })
        }}
      >
        {node.options.map((option) => (
          <option key={option.value} value={option.value}>
            {localize(option.label)}
          </option>
        ))}
      </select>
    </div>
  )
}

function Children({
  nodes,
  values,
  context,
}: {
  nodes: DeclarativeNode[]
  values: Record<string, unknown>
  context: RenderContext
}) {
  return (
    <>
      {nodes.map((child, index) => (
        <DeclarativeRenderer
          key={'id' in child && child.id ? `field-${child.id}` : `${index}-${child.type}`}
          node={child}
          values={values}
          context={context}
        />
      ))}
    </>
  )
}

const GAPS = { none: 0, xs: 4, sm: 8, md: 12, lg: 16 }
const JUSTIFY = { start: 'flex-start', center: 'center', end: 'flex-end', between: 'space-between' }
const ALIGN = { start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch' }

export function DeclarativeRenderer({
  node,
  values = {},
  context = {},
}: {
  node: DeclarativeNode
  values?: Record<string, unknown>
  context?: RenderContext
}) {
  switch (node.type) {
    case 'text': {
      const action = node.action ?? node.onActivate
      const text = interpolate(localize(node.text), values)
      const pre = /whitespace-pre|font-mono/.test(node.className ?? '')
      const props = {
        className: styles.text,
        'data-muted': node.muted || undefined,
        'data-pre': pre || undefined,
        title: node.title ? localize(node.title) : undefined,
      }
      if (!action) return <div {...props}>{text}</div>
      return (
        <button
          type="button"
          {...props}
          data-link
          onClick={() => void activatePluginAction(context.pluginId, action, context)}
        >
          {text}
        </button>
      )
    }
    case 'keyValue':
      return (
        <dl className={styles.keyValue}>
          {node.items.map((item, index) => (
            <div key={index}>
              <dt>{localize(item.key)}</dt>
              <dd>{interpolate(item.value, values)}</dd>
            </div>
          ))}
        </dl>
      )
    case 'table':
      return (
        <table className={styles.table}>
          <thead>
            <tr>
              {node.columns.map((column, index) => (
                <th key={index}>{localize(column)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {node.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex}>{interpolate(cell, values)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )
    case 'progress': {
      const percent = node.max > 0 ? Math.min(100, Math.max(0, (node.value / node.max) * 100)) : 0
      return (
        <div className={styles.progress} data-tone={node.tone ?? 'info'}>
          {node.label && (
            <div>
              <span>{localize(node.label)}</span>
              <span>{`${node.value} / ${node.max}`}</span>
            </div>
          )}
          <div className={styles.progressTrack}>
            <div style={{ width: `${percent}%` }} />
          </div>
        </div>
      )
    }
    case 'badge':
      return (
        <span
          className={styles.badge}
          data-tone={node.tone ?? 'neutral'}
          style={node.color ? { color: node.color, borderColor: node.color } : undefined}
        >
          {localize(node.label)}
        </span>
      )
    case 'button': {
      const label = localize(node.label)
      const hideLabel = node.variant === 'ghost' && Boolean(node.icon)
      return (
        <button
          type="button"
          className={styles.button}
          data-variant={node.variant ?? 'default'}
          disabled={node.disabled}
          title={node.title ? localize(node.title) : label}
          aria-label={label}
          onClick={() => void activatePluginAction(context.pluginId, node.action ?? node.onActivate, context)}
        >
          {node.icon && <PluginIcon name={node.icon} />}
          {!hideLabel && label}
        </button>
      )
    }
    case 'divider':
      return <hr className={styles.divider} />
    case 'stack':
      if (node.children.length === 0) return null
      return (
        <div
          className={styles.stack}
          style={{
            flexDirection: node.direction === 'row' ? 'row' : 'column',
            gap: GAPS[node.gap ?? 'sm'],
            alignItems: ALIGN[node.align ?? 'start'],
            justifyContent: JUSTIFY[node.justify ?? 'start'],
          }}
        >
          <Children nodes={node.children} values={values} context={context} />
        </div>
      )
    case 'card':
      return (
        <div className={styles.card}>
          {node.title && <h4>{localize(node.title)}</h4>}
          {node.subtitle && <p>{localize(node.subtitle)}</p>}
          <Children nodes={node.children} values={values} context={context} />
        </div>
      )
    case 'details':
      return (
        <details className={styles.details} open={node.defaultOpen}>
          <summary>{interpolate(localize(node.title), values)}</summary>
          <Children nodes={node.children} values={values} context={context} />
        </details>
      )
    case 'callout':
      return (
        <div className={styles.callout} data-tone={node.tone ?? 'info'}>
          <PluginIcon name={node.icon ?? (node.tone === 'danger' ? 'warning' : 'info')} size={16} />
          <div>
            {node.title && <strong>{localize(node.title)}</strong>}
            <div>{interpolate(localize(node.text), values)}</div>
          </div>
        </div>
      )
    case 'icon':
      return <PluginIcon name={node.icon} size={16} />
    case 'input':
      return node.inputType === 'checkbox' ? (
        <CheckField node={node} values={values} context={context} />
      ) : (
        <TextField node={node} values={values} context={context} />
      )
    case 'select':
      return <SelectField node={node} values={values} context={context} />
    case 'toggle': {
      const raw = node.id ? values[node.id] : undefined
      const enabled =
        raw !== undefined ? raw === true || raw === 'true' : (node.enabled ?? Boolean(node.defaultChecked))
      return (
        <label className={styles.check}>
          <input
            type="checkbox"
            role="switch"
            checked={enabled}
            disabled={node.disabled}
            onChange={() => {
              const action = node.onActivate ?? node.onChange
              if (action)
                void activatePluginAction(context.pluginId, action, {
                  ...context,
                  ...(node.id ? { fieldId: node.id } : {}),
                  value: String(!enabled),
                })
            }}
          />
          {node.label && localize(node.label)}
        </label>
      )
    }
    case 'iframe':
      return (
        <iframe
          title={node.url}
          src={node.url}
          className={styles.frame}
          style={{
            height: typeof node.height === 'number' ? `${node.height}px` : (node.height ?? '200px'),
            width: typeof node.width === 'number' ? `${node.width}px` : (node.width ?? '100%'),
          }}
          sandbox="allow-scripts allow-forms allow-same-origin"
        />
      )
    default:
      return null
  }
}

function nodeFromResult(result: unknown): DeclarativeNode | undefined {
  if (!result || typeof result !== 'object') return undefined
  const body = result as { content?: unknown; nodes?: unknown }
  if (body.content && typeof body.content === 'object') return body.content as DeclarativeNode
  if (Array.isArray(body.nodes) && body.nodes.length > 0)
    return { type: 'stack', direction: 'column', gap: 'sm', children: body.nodes as DeclarativeNode[] }
  return undefined
}

function useContentSource(
  source: PluginUiContentSource | undefined,
  pluginId: string | undefined,
  itemId: string,
  context: PluginContext,
): DeclarativeNode | undefined {
  const [content, setContent] = useState<DeclarativeNode>()
  const method = source?.method
  const refreshMs = source?.refreshMs
  const { sessionId, workdir, projectId } = context
  useEffect(() => {
    if (!pluginId || !method) return
    let active = true
    const ctx = {
      ...(sessionId ? { sessionId } : {}),
      ...(workdir ? { workdir } : {}),
      ...(projectId ? { projectId } : {}),
    }
    const load = () =>
      invokePluginRpc(pluginId, method, { contributionId: itemId, ...(workdir ? { workdir } : {}) }, ctx)
        .then((result) => {
          const node = nodeFromResult(result)
          if (active && node) setContent(node)
        })
        .catch(() => {})
    void load()
    const interval = refreshMs && refreshMs > 0 ? window.setInterval(() => void load(), refreshMs) : undefined
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [pluginId, method, itemId, refreshMs, sessionId, workdir, projectId])
  return content
}

function ScopedNode({
  item,
  fallback,
  context,
  base,
}: {
  item: PluginUiComponent | PluginUiOverride
  fallback?: ReactNode
  context: PluginContext
  base: DeclarativeNode | undefined
}) {
  const published = usePlugins((state) => state.values)
  const pluginId = item.pluginId ?? 'unknown'
  const values = extractScopedValues(published, pluginId, item.id)
  const sourced = useContentSource(item.contentSource, item.pluginId, item.id, context)
  const node = sourced ?? (values['content'] as DeclarativeNode | undefined) ?? base
  if (!node) return <>{fallback}</>
  return (
    <DeclarativeRenderer
      node={node}
      values={values}
      context={{ ...context, ...rpcContext(context), ...(item.pluginId ? { pluginId: item.pluginId } : {}) }}
    />
  )
}

class Boundary extends Component<{ fallback?: ReactNode; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  override render() {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children
  }
}

export function ZoneRender({
  id,
  context,
  children,
}: {
  id: PluginZoneId
  context: PluginContext
  children?: ReactNode
}) {
  const contributions = usePlugins((state) => state.contributions)
  const { before, inside, after, override } = useMemo(() => {
    const byOrder = <T extends { order?: number }>(a: T, b: T) => (a.order ?? 50) - (b.order ?? 50)
    const components = contributions.components
      .filter((c) => c.zone === id && isContributionVisible(c.visibleWhen, context))
      .sort(byOrder)
    const overrides = contributions.overrides
      .filter((o) => o.zone === id && isContributionVisible(o.visibleWhen, context))
      .sort(byOrder)
    return {
      before: components.filter((c) => c.position === 'before'),
      inside: components.filter((c) => (c.position ?? 'inside') === 'inside'),
      after: components.filter((c) => c.position === 'after'),
      override: overrides[overrides.length - 1],
    }
  }, [contributions, id, context])

  const draw = (comp: PluginUiComponent) => (
    <Boundary key={`${comp.pluginId}:${comp.id}`}>
      <ScopedNode item={comp} context={context} base={comp.component} />
    </Boundary>
  )

  let main = children
  if (override?.mode === 'hide') main = null
  else if (override?.mode === 'replace' && (override.replacement || override.contentSource)) {
    main = (
      <Boundary fallback={children}>
        <ScopedNode item={override} fallback={children} context={context} base={override.replacement} />
      </Boundary>
    )
  }

  // display: contents keeps the parent's flex or grid layout intact
  return (
    <div style={{ display: 'contents' }} data-plugin-zone={id}>
      {before.map(draw)}
      {main}
      {inside.map(draw)}
      {after.map(draw)}
    </div>
  )
}
