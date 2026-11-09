// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { PluginSettingsField } from '@shared/plugin.js'
import {
  MASKED_SECRET,
  buildSettingsPayload,
  extractScopedValues,
  initialFieldValue,
  interpolate,
  isContributionVisible,
  localize,
  resolveLinkHref,
} from './core'

const field = (over: Partial<PluginSettingsField>): PluginSettingsField => ({
  key: 'k',
  type: 'text',
  label: { en: 'L', fr: 'L' },
  ...over,
})

describe('isContributionVisible', () => {
  it('ANDs the context conditions', () => {
    expect(isContributionVisible({ hasSession: true }, {})).toBe(false)
    expect(isContributionVisible({ hasSession: true, hasMessage: true }, { sessionId: 's' })).toBe(false)
    expect(isContributionVisible({ hasSession: true }, { sessionId: 's' })).toBe(true)
    expect(isContributionVisible(undefined, {})).toBe(true)
  })

  it('applies eq and neq', () => {
    expect(isContributionVisible({ eq: { tab: 'a' } }, { tab: 'b' })).toBe(false)
    expect(isContributionVisible({ neq: { tab: 'a' } }, { tab: 'a' })).toBe(false)
  })
})

describe('extractScopedValues', () => {
  it('merges plugin-wide values, panel values winning', () => {
    const published = { 'p::a': 1, 'p::b': 1, 'p:panel:b': 2, 'q::a': 9 }
    expect(extractScopedValues(published, 'p', 'panel')).toEqual({ a: 1, b: 2 })
  })
})

describe('interpolate', () => {
  it('fills known placeholders and keeps unknown ones', () => {
    expect(interpolate('{{a}} {{z}}', { a: 1 })).toBe('1 {{z}}')
    expect(interpolate(null, {})).toBe('')
  })
})

describe('localize', () => {
  it('reads plain strings and the locale entry', () => {
    expect(localize('x')).toBe('x')
    expect(localize({ en: 'hello', fr: 'salut' })).toBe('hello')
    expect(localize(undefined)).toBe('')
  })
})

describe('plugin settings values', () => {
  it('masks a stored secret instead of showing it', () => {
    expect(initialFieldValue(field({ type: 'password' }), { k: 'real' }, ['k'])).toBe(MASKED_SECRET)
  })

  it('never sends an untouched or emptied secret', () => {
    const fields = [
      field({ key: 'a', type: 'password' }),
      field({ key: 'b', type: 'password' }),
      field({ key: 'c', secret: true }),
    ]
    expect(buildSettingsPayload(fields, { a: MASKED_SECRET, b: '', c: 'new' })).toEqual({ c: 'new' })
  })

  it('skips display-only fields and blank numbers', () => {
    const fields = [
      field({ key: 'a', type: 'button' }),
      field({ key: 'b', type: 'status' }),
      field({ key: 'c', readOnly: true }),
      field({ key: 'd', type: 'number' }),
    ]
    expect(buildSettingsPayload(fields, { a: 'x', b: 'x', c: 'x', d: '' })).toEqual({})
  })

  it('falls back to the default by type', () => {
    expect(initialFieldValue(field({ type: 'boolean', default: true }), {}, [])).toBe(true)
    expect(initialFieldValue(field({ type: 'number' }), {}, [])).toBe('')
    expect(initialFieldValue(field({ type: 'list' }), {}, [])).toBe('[]')
  })
})

describe('resolveLinkHref', () => {
  it('fills values and URL origins', () => {
    expect(
      resolveLinkHref({ label: { en: 'x', fr: 'x' }, href: '{{u.origin}}/t?{{id}}' }, { u: 'https://a.io/g/h', id: 7 }),
    ).toBe('https://a.io/t?7')
  })

  it('picks a template by field value', () => {
    expect(
      resolveLinkHref(
        { label: { en: 'x', fr: 'x' }, hrefByField: 'p', hrefByValue: { a: 'https://a' }, href: 'https://d' },
        { p: 'a' },
      ),
    ).toBe('https://a')
  })
})
