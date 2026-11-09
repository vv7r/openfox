import { describe, expect, it } from 'vitest'
import { hexToTriplet, tripletToHex } from './themeColors'

describe('theme colors', () => {
  it('round-trips hex and triplets', () => {
    expect(hexToTriplet('#0a1b2c')).toBe('10 27 44')
    expect(tripletToHex('10 27 44')).toBe('#0a1b2c')
  })

  it('leaves partial typing alone and survives garbage', () => {
    expect(hexToTriplet('12 3')).toBe('12 3')
    expect(tripletToHex('nope')).toBe('#000000')
  })
})
