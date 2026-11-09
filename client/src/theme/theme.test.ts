// @vitest-environment node
import { describe, expect, it } from 'vitest'
import presets from './presets.json'
import { DEFAULT_DARK_THEME, DEFAULT_LIGHT_THEME, resolveTokens } from './resolve'

const accent = 'color-accent-primary'
const NORD = '136 192 208'
const SOLARIZED_LIGHT = '31 118 181'
const DRACULA = '189 147 249'

describe('resolveTokens', () => {
  it('follows the system preference without a saved theme', () => {
    expect(resolveTokens(null, true)[accent]).toBe(NORD)
    expect(resolveTokens(null, false)[accent]).toBe(SOLARIZED_LIGHT)
  })

  it('reads a saved preset, in JSON or plain form', () => {
    expect(resolveTokens('{"preset":"dracula"}', true)[accent]).toBe(DRACULA)
    expect(resolveTokens('dracula', true)[accent]).toBe(DRACULA)
  })

  it('resolves the virtual system preset', () => {
    expect(resolveTokens('{"preset":"system"}', false)[accent]).toBe(SOLARIZED_LIGHT)
  })

  it('lets custom tokens override their preset', () => {
    expect(resolveTokens('{"preset":"nord","tokens":{"color-accent-primary":"1 2 3"}}', true)[accent]).toBe('1 2 3')
  })

  it('survives a corrupt value', () => {
    expect(resolveTokens('{oops', true)[accent]).toBe(NORD)
  })

  it('gives the default to a theme that no longer exists', () => {
    expect(resolveTokens('{"preset":"rose-pine"}', true)[accent]).toBe(NORD)
  })
})

describe('resolveTokens with a theme library', () => {
  const library = {
    prefs: { darkPreset: 'dracula', lightPreset: 'mine' },
    users: [{ id: 'mine', name: 'Mine', basePreset: 'solarized-light', tokens: { [accent]: '9 9 9' } }],
  }

  it('uses the chosen dark preset under system', () => {
    expect(resolveTokens('{"preset":"system"}', true, library)[accent]).toBe(DRACULA)
  })

  it('resolves a user preset under system, over its base', () => {
    const tokens = resolveTokens('{"preset":"system"}', false, library)
    expect(tokens[accent]).toBe('9 9 9')
    expect(tokens['color-border']).toBe(resolveTokens('{"preset":"solarized-light"}', false)['color-border'])
  })
})

describe('the built-in themes', () => {
  const themes = presets.presets.filter((preset) => preset.id !== 'system')
  const keys = presets.tokens.map((token) => token.key)
  const channel = (value: number) => {
    const v = value / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  const luminance = (triplet: string) => {
    const [r = 0, g = 0, b = 0] = triplet.split(' ').map(Number)
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
  }
  const contrast = (a: string, b: string) => {
    const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x)
    return (high! + 0.05) / (low! + 0.05)
  }

  it('include the defaults, each in its mode', () => {
    expect(themes.find((theme) => theme.id === DEFAULT_DARK_THEME)?.mode).toBe('dark')
    expect(themes.find((theme) => theme.id === DEFAULT_LIGHT_THEME)?.mode).toBe('light')
  })

  it.each(themes.map((theme) => [theme.id, theme.tokens as Record<string, string>] as const))(
    '%s defines every colour and stays readable',
    (_id, tokens) => {
      expect(Object.keys(tokens).sort()).toEqual([...keys].sort())
      expect(contrast(tokens['color-text-primary']!, tokens['color-primary']!)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(tokens['color-text-primary']!, tokens['color-secondary']!)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(tokens['color-text-muted']!, tokens['color-primary']!)).toBeGreaterThanOrEqual(3.8)
      expect(contrast(tokens['color-on-accent']!, tokens['color-accent-primary']!)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(tokens['color-accent-primary']!, tokens['color-primary']!)).toBeGreaterThanOrEqual(3)
    },
  )
})
