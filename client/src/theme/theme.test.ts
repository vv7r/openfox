// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { resolveTokens } from './theme'

const accent = 'color-accent-primary'

describe('resolveTokens', () => {
  it('follows the system preference without a saved theme', () => {
    expect(resolveTokens(null, true)[accent]).toBe('245 184 61')
    expect(resolveTokens(null, false)[accent]).toBe('166 99 0')
  })

  it('reads a saved preset, in JSON or plain form', () => {
    expect(resolveTokens('{"preset":"monokai"}', true)[accent]).toBe('102 217 239')
    expect(resolveTokens('monokai', true)[accent]).toBe('102 217 239')
  })

  it('resolves the virtual system preset', () => {
    expect(resolveTokens('{"preset":"system"}', false)[accent]).toBe('166 99 0')
  })

  it('lets custom tokens override their preset', () => {
    expect(resolveTokens('{"preset":"dark","tokens":{"color-accent-primary":"1 2 3"}}', true)[accent]).toBe('1 2 3')
  })

  it('survives a corrupt value', () => {
    expect(resolveTokens('{oops', true)[accent]).toBe('245 184 61')
  })
})

describe('resolveTokens with a theme library', () => {
  const library = {
    prefs: { darkPreset: 'monokai', lightPreset: 'mine' },
    users: [{ id: 'mine', name: 'Mine', basePreset: 'light', tokens: { [accent]: '9 9 9' } }],
  }

  it('uses the chosen dark preset under system', () => {
    expect(resolveTokens('{"preset":"system"}', true, library)[accent]).toBe('102 217 239')
  })

  it('resolves a user preset under system, over its base', () => {
    const tokens = resolveTokens('{"preset":"system"}', false, library)
    expect(tokens[accent]).toBe('9 9 9')
    expect(tokens['color-border']).toBe(resolveTokens('{"preset":"light"}', false)['color-border'])
  })
})
