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
