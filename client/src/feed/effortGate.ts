import { isReasoningEffortValue } from '@shared/reasoning-effort.js'
import type { Session } from '@shared/types.js'

/** A model's own default: the override wins, then the thinking level when thinking is on. */
export interface EffortDefaults {
  reasoningEffortOverride?: string
  thinkingEnabled?: boolean
  thinkingLevel?: string
}

export const modelDefaultEffort = (model: EffortDefaults | undefined): string | undefined =>
  model?.reasoningEffortOverride ?? (model?.thinkingEnabled ? model.thinkingLevel : undefined)

/**
 * The effort the server would send right now: pin, then a manual pick, then the agent's
 * override, then the session's stored effort, then the model default. Only values the
 * session can store count: a custom model default leaves nothing for "keep" to pin.
 */
export function effectiveEffort(
  session: Pick<
    Session,
    'providerPinnedEffort' | 'providerReasoningEffort' | 'providerManual' | 'providerManualActive'
  > | null,
  agentEffort: string | undefined,
  modelDefault: string | undefined,
): string | undefined {
  const manual = Boolean(session?.providerManual && session.providerManualActive)
  const resolved = manual
    ? (session?.providerPinnedEffort ?? session?.providerReasoningEffort ?? modelDefault)
    : (session?.providerPinnedEffort ?? agentEffort ?? session?.providerReasoningEffort ?? modelDefault)
  return resolved && isReasoningEffortValue(resolved) ? resolved : undefined
}

/** Asking only makes sense with a warm cache to lose and a real effort to keep. */
export function shouldGateEffort(
  warmCache: boolean | undefined,
  current: string | undefined,
  next: string | undefined,
): boolean {
  return Boolean(warmCache && next && current && isReasoningEffortValue(current) && next !== current)
}

/**
 * The model whose default effort applies: like the server, an active manual pick wins,
 * then the agent's override, then the session's own model.
 */
export function effortModelRef(
  session: Pick<Session, 'providerId' | 'providerModel' | 'providerManual' | 'providerManualActive'> | null | undefined,
  agentOverride: string | undefined,
): { providerId?: string | null | undefined; model?: string | null | undefined } {
  const manual = Boolean(session?.providerManual && session.providerManualActive)
  const slash = agentOverride?.indexOf('/') ?? -1
  if (manual || !agentOverride || slash <= 0) return { providerId: session?.providerId, model: session?.providerModel }
  const effort = overrideEffort(agentOverride)
  const model = agentOverride.slice(slash + 1)
  return {
    providerId: agentOverride.slice(0, slash),
    model: effort ? model.slice(0, model.lastIndexOf(':')) : model,
  }
}

/** "provider/model:effort" is how agent overrides are stored. */
export function overrideEffort(value: string | undefined): string | undefined {
  if (!value) return undefined
  const suffix = value.slice(value.lastIndexOf(':') + 1)
  return value.includes(':') && isReasoningEffortValue(suffix) ? suffix : undefined
}
