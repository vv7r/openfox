// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  applyAutoConfig,
  buildMerged,
  defaultEffort,
  expandMerged,
  filterModels,
  findDuplicate,
  isSmallContext,
  effortOverrideOf,
  mergeCatalog,
  modelPayload,
  moveInList,
  toggleInList,
  type AutoConfigResult,
  type ModelInfo,
} from './wizard'

const model = (id: string, extra: Partial<ModelInfo> = {}) => ({ id, contextWindow: 1000, ...extra }) as ModelInfo
const auto = (extra: Partial<AutoConfigResult>): AutoConfigResult => ({
  id: 'm',
  contextWindow: 5000,
  contextSource: 'backend',
  supportsVision: true,
  thinkingConfig: null,
  nonThinkingConfig: null,
  ...extra,
})

describe('catalog helpers', () => {
  it('prefers medium as the default effort', () => {
    expect(defaultEffort(['low', 'medium'])).toBe('medium')
    expect(defaultEffort(['high'])).toBe('high')
    expect(defaultEffort([])).toBeUndefined()
  })

  it('matches duplicates as the server does', () => {
    expect(findDuplicate([model('my-model')], 'MY_model')?.id).toBe('my-model')
    expect(findDuplicate([model('a')], 'b')).toBeUndefined()
  })

  it('needs every search term', () => {
    expect(filterModels([model('gpt-4o'), model('claude')], 'gpt 4').map((m) => m.id)).toEqual(['gpt-4o'])
    expect(filterModels([model('a')], '  ')).toHaveLength(1)
  })

  it('warns below the base prompt size', () => {
    expect(isSmallContext(8000)).toBe(true)
    expect(isSmallContext(16384)).toBe(false)
  })
})

describe('mode families', () => {
  it('builds a merged model and expands it back', () => {
    const merged = buildMerged('m', undefined, [model('m-high'), model('m-low')])
    expect(merged.reasoningEfforts).toEqual(['low', 'high'])
    expect(expandMerged(merged).map((m) => m.id)).toEqual(['m-low', 'm-high'])
  })

  it('keeps merged models and hides the variants they claim', () => {
    const merged = model('m', { modes: [{ level: 'low', apiModelId: 'm-low' }] })
    const { combined, added } = mergeCatalog([merged, model('old')], [model('m-low'), model('new')])
    expect(added.map((m) => m.id)).toEqual(['new'])
    expect(combined.map((m) => m.id)).toEqual(['m', 'new'])
  })
})

describe('mergeCatalog and the models the provider does not list', () => {
  it('keeps a selected model missing from the catalog, drops an unselected one', () => {
    const { combined, added } = mergeCatalog([model('manual'), model('gone')], [model('listed')], new Set(['manual']))
    expect(combined.map((m) => m.id)).toEqual(['manual', 'listed'])
    expect(added.map((m) => m.id)).toEqual(['listed'])
  })

  it('refreshes a selected model the catalog still lists', () => {
    const { combined } = mergeCatalog(
      [model('m', { contextWindow: 1 })],
      [model('m', { contextWindow: 9 })],
      new Set(['m']),
    )
    expect(combined).toEqual([expect.objectContaining({ id: 'm', contextWindow: 9 })])
  })
})

describe('effortOverrideOf', () => {
  const withOverride = model('m', { reasoningEffortOverride: 'high' })

  it('falls back on the model until the field is edited', () => {
    expect(effortOverrideOf(withOverride, undefined)).toBe('high')
    expect(effortOverrideOf(withOverride, { contextWindow: 1 })).toBe('high')
  })

  it('lets the field replace or clear the override', () => {
    expect(effortOverrideOf(withOverride, { contextWindow: 1, reasoningEffortOverride: 'low' })).toBe('low')
    expect(effortOverrideOf(withOverride, { contextWindow: 1, reasoningEffortOverride: undefined })).toBeUndefined()
  })

  it('saves a cleared override as absent', () => {
    expect(
      modelPayload(withOverride, { contextWindow: 1, reasoningEffortOverride: undefined }, true)
        .reasoningEffortOverride,
    ).toBeUndefined()
  })
})

describe('applyAutoConfig', () => {
  it('ignores a guessed context window', () => {
    expect(applyAutoConfig(auto({ contextSource: 'default' }), undefined).contextWindow).toBeUndefined()
    expect(applyAutoConfig(auto({}), undefined).contextWindow).toBe(5000)
  })

  it('keeps a chosen thinking level over the probe', () => {
    const result = auto({ thinkingConfig: { a: 1 }, defaultReasoningEffort: 'high' })
    expect(applyAutoConfig(result, undefined).thinkingLevel).toBe('high')
    expect(applyAutoConfig(result, { contextWindow: 1, thinkingLevel: 'low' }).thinkingLevel).toBe('low')
  })

  it('records rejected parameters and effort lists', () => {
    const patch = applyAutoConfig(auto({ rejectedParams: ['top_k'], reasoningEfforts: ['low'] }), undefined)
    expect(patch.omitParams).toEqual(['top_k'])
    expect(patch.reasoningEfforts).toEqual(['low'])
  })
})

describe('modelPayload', () => {
  it('uses edited values and marks only selected models', () => {
    const payload = modelPayload(model('m'), { contextWindow: 9 }, false)
    expect(payload.contextWindow).toBe(9)
    expect(payload.selected).toBeUndefined()
    expect(modelPayload(model('m'), undefined, true).selected).toBe(true)
  })
})

describe('list helpers', () => {
  it('toggles an item', () => {
    expect(toggleInList(['a'], 'b')).toEqual(['a', 'b'])
    expect(toggleInList(['a', 'b'], 'a')).toEqual(['b'])
  })

  it('moves within bounds only', () => {
    expect(moveInList(['a', 'b'], 1, -1)).toEqual(['b', 'a'])
    expect(moveInList(['a', 'b'], 0, -1)).toEqual(['a', 'b'])
  })
})
