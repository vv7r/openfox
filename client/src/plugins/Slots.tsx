import { lazy, Suspense, useMemo, type ReactNode } from 'react'
import type { PluginUiAction, PluginUiBadge, PluginZoneId } from '@shared/plugin.js'
import { useApp } from '../store/app'
import { useRoute } from '../router'
import { isContributionVisible, type PluginContext } from './core'
import { usePlugins } from './store'

// Everything that draws a contribution is loaded only when one exists
const render = () => import('./Render')
const ActionButtons = lazy(() => render().then((m) => ({ default: m.ActionButtons })))
const BadgeList = lazy(() => render().then((m) => ({ default: m.BadgeList })))
const ZoneRender = lazy(() => render().then((m) => ({ default: m.ZoneRender })))

/** The context every plugin contribution receives from the current location. */
export function usePluginContext(): PluginContext {
  const { projectId, sessionId } = useRoute()
  const workdir = useApp((state) => state.session?.workspace ?? state.session?.workdir)
  return useMemo(
    () => ({
      ...(projectId ? { projectId } : {}),
      ...(sessionId ? { sessionId } : {}),
      ...(workdir ? { workdir } : {}),
    }),
    [projectId, sessionId, workdir],
  )
}

export function PluginActions({ slot, context }: { slot: PluginUiAction['slot']; context: PluginContext }) {
  const actions = usePlugins((state) => state.contributions.actions)
  const visible = useMemo(
    () => actions.filter((action) => action.slot === slot && isContributionVisible(action.visibleWhen, context)),
    [actions, slot, context],
  )
  if (visible.length === 0) return null
  return (
    <Suspense fallback={null}>
      <ActionButtons actions={visible} context={context} />
    </Suspense>
  )
}

export function PluginBadges({ slot, context }: { slot: PluginUiBadge['slot']; context: PluginContext }) {
  const badges = usePlugins((state) => state.contributions.badges)
  const visible = useMemo(
    () => badges.filter((badge) => badge.slot === slot && isContributionVisible(badge.visibleWhen, context)),
    [badges, slot, context],
  )
  if (visible.length === 0) return null
  return (
    <Suspense fallback={null}>
      <BadgeList badges={visible} context={context} />
    </Suspense>
  )
}

/** Renders its children untouched, with no wrapper, unless a plugin targets this zone. */
export function PluginZone({
  id,
  context,
  children,
}: {
  id: PluginZoneId
  context: PluginContext
  children?: ReactNode
}) {
  const used = usePlugins(
    (state) =>
      state.contributions.components.some((c) => c.zone === id) ||
      state.contributions.overrides.some((o) => o.zone === id),
  )
  if (!used) return <>{children}</>
  return (
    <Suspense fallback={children}>
      <ZoneRender id={id} context={context}>
        {children}
      </ZoneRender>
    </Suspense>
  )
}
