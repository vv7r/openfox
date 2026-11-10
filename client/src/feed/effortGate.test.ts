// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { effectiveEffort, effortModelRef, modelDefaultEffort, overrideEffort, shouldGateEffort } from './effortGate'

describe('effectiveEffort', () => {
  it('prefers the pin, then the agent, then the stored effort, then the model', () => {
    expect(effectiveEffort({ providerPinnedEffort: 'low', providerReasoningEffort: 'high' }, 'medium', 'none')).toBe(
      'low',
    )
    expect(effectiveEffort({ providerReasoningEffort: 'high' }, 'medium', 'none')).toBe('medium')
    expect(effectiveEffort({ providerReasoningEffort: 'high' }, undefined, 'none')).toBe('high')
    expect(effectiveEffort({}, undefined, 'none')).toBe('none')
  })

  it('ignores the agent during an active manual pick', () => {
    const session = { providerManual: true, providerManualActive: true, providerReasoningEffort: 'high' }
    expect(effectiveEffort(session, 'medium', undefined)).toBe('high')
  })

  it('drops an effort the session could not store', () => {
    expect(effectiveEffort({}, undefined, 'deep-custom')).toBeUndefined()
  })
})

describe('shouldGateEffort', () => {
  it('asks only with a warm cache and a real change', () => {
    expect(shouldGateEffort(true, 'low', 'high')).toBe(true)
    expect(shouldGateEffort(false, 'low', 'high')).toBe(false)
    expect(shouldGateEffort(true, 'low', 'low')).toBe(false)
    expect(shouldGateEffort(true, undefined, 'high')).toBe(false)
    expect(shouldGateEffort(true, 'custom', 'high')).toBe(false)
  })
})

describe('model and override helpers', () => {
  it('reads the model default', () => {
    expect(modelDefaultEffort({ reasoningEffortOverride: 'x', thinkingEnabled: true, thinkingLevel: 'low' })).toBe('x')
    expect(modelDefaultEffort({ thinkingEnabled: false, thinkingLevel: 'low' })).toBeUndefined()
    expect(modelDefaultEffort({ thinkingEnabled: true, thinkingLevel: 'low' })).toBe('low')
  })

  it('reads the effort of an agent override', () => {
    expect(overrideEffort('p/model:high')).toBe('high')
    expect(overrideEffort('p/model')).toBeUndefined()
    expect(overrideEffort(undefined)).toBeUndefined()
  })
})

describe('effortModelRef', () => {
  const session = { providerId: 'p', providerModel: 'm' }

  it('is the session model without an agent override', () => {
    expect(effortModelRef(session, undefined)).toEqual({ providerId: 'p', model: 'm' })
  })

  it('is the override model, without its effort suffix', () => {
    expect(effortModelRef(session, 'q/n:low')).toEqual({ providerId: 'q', model: 'n' })
  })

  it('keeps a colon that belongs to the model id', () => {
    expect(effortModelRef(session, 'q/deepseek-r1:70b')).toEqual({ providerId: 'q', model: 'deepseek-r1:70b' })
  })

  it('lets an active manual pick win over the agent', () => {
    expect(effortModelRef({ ...session, providerManual: true, providerManualActive: true }, 'q/n')).toEqual({
      providerId: 'p',
      model: 'm',
    })
  })
})
