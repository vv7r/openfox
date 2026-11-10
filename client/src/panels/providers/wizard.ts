import {
  collapseModeFamilies,
  sortByModeLevel,
  splitModeSuffix,
  UNKNOWN_CONTEXT_WINDOW,
} from '@shared/reasoning-effort.js'
import type { ModelConfig as SharedModelConfig } from '@shared/types.js'

export type ModelInfo = Omit<SharedModelConfig, 'source'>

export interface ModelSettings {
  contextWindow: number
  supportsVision?: boolean | undefined
  thinkingEnabled?: boolean | undefined
  thinkingLevel?: string | undefined
  reasoningEfforts?: string[] | undefined
  reasoningEffortOverride?: string | undefined
  nonThinkingEnabled?: boolean | undefined
  thinkingQueryParams?: string | undefined
  nonThinkingQueryParams?: string | undefined
  omitParams?: string[] | undefined
  temperature?: number | undefined
  topP?: number | undefined
  topK?: number | undefined
  maxTokens?: number | undefined
  defaultTemperature?: number | undefined
  defaultTopP?: number | undefined
  defaultTopK?: number | undefined
  defaultMaxTokens?: number | undefined
  compactionThreshold?: number | undefined
}

export type Settings = Record<string, ModelSettings>

/** Below this the base prompt no longer fits and providers silently truncate it. */
export const MIN_CONTEXT_WARNING = 16384
export const isSmallContext = (contextWindow: number): boolean => contextWindow < MIN_CONTEXT_WARNING

export const defaultEffort = (efforts: string[] | undefined): string | undefined =>
  efforts?.length ? (efforts.includes('medium') ? 'medium' : efforts[0]) : undefined

const normalizeId = (id: string): string => id.toLowerCase().replace(/[-_\s:.]+/g, '')

/** Same comparison as the server: "my-model" and "my_model" are one model. */
export const findDuplicate = (models: ModelInfo[], id: string): ModelInfo | undefined =>
  models.find((model) => normalizeId(model.id) === normalizeId(id))

export function filterModels(models: ModelInfo[], query: string): ModelInfo[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  return terms.length === 0
    ? models
    : models.filter((model) => terms.every((term) => model.id.toLowerCase().includes(term)))
}

export function settingsFromModel(model: ModelInfo): ModelSettings {
  return {
    contextWindow: model.contextWindow,
    supportsVision: model.supportsVision,
    thinkingEnabled: model.thinkingEnabled,
    thinkingLevel: model.thinkingLevel ?? defaultEffort(model.reasoningEfforts),
    nonThinkingEnabled: model.nonThinkingEnabled,
    thinkingQueryParams: model.thinkingQueryParams,
    nonThinkingQueryParams: model.nonThinkingQueryParams,
    omitParams: model.omitParams,
    defaultTemperature: model.defaultTemperature,
    defaultTopP: model.defaultTopP,
    defaultTopK: model.defaultTopK,
    defaultMaxTokens: model.defaultMaxTokens,
    temperature: model.temperature,
    topP: model.topP,
    topK: model.topK,
    maxTokens: model.maxTokens,
    compactionThreshold: model.compactionThreshold,
  }
}

/** A model fresh from the catalog: thinking on, its advertised defaults kept. */
export function settingsFromCatalog(model: ModelInfo): ModelSettings {
  return {
    contextWindow: model.contextWindow,
    supportsVision: model.supportsVision,
    thinkingEnabled: true,
    thinkingLevel: defaultEffort(model.reasoningEfforts),
    defaultTemperature: model.defaultTemperature,
    defaultTopP: model.defaultTopP,
    defaultTopK: model.defaultTopK,
    defaultMaxTokens: model.defaultMaxTokens,
  }
}

/** Keeps merged families and hand-added models, and hides catalog variants the families claim. */
export function mergeCatalog(
  current: ModelInfo[],
  catalog: ModelInfo[],
  selected: ReadonlySet<string> = new Set(),
): { combined: ModelInfo[]; added: ModelInfo[] } {
  const listed = new Set(catalog.map((model) => model.id))
  // A model the user picked and the provider does not list was added by hand
  const merged = current.filter((model) => model.modes?.length || (selected.has(model.id) && !listed.has(model.id)))
  const claimed = new Set<string>()
  for (const model of merged) {
    claimed.add(model.id)
    model.modes?.forEach((mode) => mode.apiModelId && claimed.add(mode.apiModelId))
  }
  const added: ModelInfo[] = []
  for (const model of catalog) {
    if (claimed.has(model.id)) continue
    claimed.add(model.id)
    added.push(model)
  }
  return { combined: collapseModeFamilies([...merged, ...added]), added }
}

export function buildMerged(baseId: string, base: ModelInfo | undefined, members: ModelInfo[]): ModelInfo {
  const sorted = sortByModeLevel(members)
  return {
    id: baseId,
    name: base?.name ?? baseId.split('/').pop()?.replace(/-/g, ' ') ?? baseId,
    ...((base?.apiModelId ?? (base ? baseId : undefined)) ? { apiModelId: base?.apiModelId ?? baseId } : {}),
    ...(base?.requestBody === undefined ? {} : { requestBody: base.requestBody }),
    contextWindow: base?.contextWindow ?? sorted[0]?.contextWindow ?? UNKNOWN_CONTEXT_WINDOW,
    reasoningEfforts: sorted.flatMap((model) => splitModeSuffix(model.id)?.level ?? []),
    modes: sorted.map((model) => ({
      level: splitModeSuffix(model.id)!.level,
      apiModelId: model.apiModelId ?? model.id,
      ...(model.name === undefined ? {} : { name: model.name.split('/').pop() ?? model.name }),
    })),
  }
}

export function expandMerged(merged: ModelInfo): ModelInfo[] {
  return (merged.modes ?? []).map((mode) => ({
    id: mode.apiModelId ?? merged.id,
    ...(mode.name === undefined ? {} : { name: mode.name }),
    apiModelId: mode.apiModelId ?? merged.id,
    contextWindow: merged.contextWindow,
    ...(merged.requestBody === undefined ? {} : { requestBody: merged.requestBody }),
    ...(merged.supportsVision === undefined ? {} : { supportsVision: merged.supportsVision }),
  }))
}

export interface AutoConfigResult {
  id: string
  contextWindow: number
  contextSource: 'backend' | 'hardcoded' | 'default'
  supportsVision: boolean
  thinkingConfig: Record<string, unknown> | null
  nonThinkingConfig: Record<string, unknown> | null
  sendReasoningInMessages?: boolean
  thinkingField?: string
  rejectedParams?: string[]
  reasoningEfforts?: string[]
  defaultReasoningEffort?: string
}

export function applyAutoConfig(result: AutoConfigResult, current: ModelSettings | undefined): Partial<ModelSettings> {
  const patch: Partial<ModelSettings> = {}
  // A guessed context window is worse than what the user or catalog already has
  if (result.contextSource !== 'default') {
    patch.contextWindow = result.contextWindow
    patch.supportsVision = result.supportsVision
  }
  if (result.thinkingConfig) {
    patch.thinkingEnabled = true
    patch.thinkingQueryParams = JSON.stringify(result.thinkingConfig)
    patch.thinkingLevel =
      current?.thinkingLevel ?? result.defaultReasoningEffort ?? defaultEffort(result.reasoningEfforts)
  }
  if (result.nonThinkingConfig) {
    patch.nonThinkingEnabled = true
    patch.nonThinkingQueryParams = JSON.stringify(result.nonThinkingConfig)
  }
  if (result.rejectedParams?.length) patch.omitParams = result.rejectedParams
  if (result.reasoningEfforts?.length) patch.reasoningEfforts = result.reasoningEfforts
  return patch
}

/** The field's value: once edited it replaces the model's, even when emptied. */
export function effortOverrideOf(model: ModelInfo, settings: ModelSettings | undefined): string | undefined {
  return settings && 'reasoningEffortOverride' in settings
    ? settings.reasoningEffortOverride
    : model.reasoningEffortOverride
}

/** What the server stores for one model; undefined fields drop out of the JSON. */
export function modelPayload(model: ModelInfo, settings: ModelSettings | undefined, selected: boolean) {
  return {
    id: model.id,
    name: model.name,
    apiModelId: model.apiModelId,
    requestBody: model.requestBody,
    reasoningEfforts: settings?.reasoningEfforts ?? model.reasoningEfforts,
    reasoningEffortOverride: effortOverrideOf(model, settings),
    modes: model.modes,
    contextWindow: settings?.contextWindow ?? model.contextWindow,
    selected: selected || undefined,
    supportsVision: settings?.supportsVision,
    thinkingEnabled: settings?.thinkingEnabled,
    thinkingLevel: settings?.thinkingLevel,
    nonThinkingEnabled: settings?.nonThinkingEnabled,
    thinkingQueryParams: settings?.thinkingQueryParams,
    nonThinkingQueryParams: settings?.nonThinkingQueryParams,
    omitParams: settings?.omitParams,
    temperature: settings?.temperature,
    topP: settings?.topP,
    topK: settings?.topK,
    maxTokens: settings?.maxTokens,
    defaultMaxTokens: settings?.defaultMaxTokens,
    defaultTemperature: settings?.defaultTemperature,
    defaultTopP: settings?.defaultTopP,
    defaultTopK: settings?.defaultTopK,
    compactionThreshold: settings?.compactionThreshold,
  }
}

export function toggleInList<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((entry) => entry !== item) : [...list, item]
}

/** Swaps an item with its neighbour; out of range leaves the list unchanged. */
export function moveInList<T>(list: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction
  if (index < 0 || target < 0 || target >= list.length) return list
  const next = [...list]
  ;[next[index], next[target]] = [next[target]!, next[index]!]
  return next
}
