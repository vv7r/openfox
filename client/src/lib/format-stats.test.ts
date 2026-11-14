// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { formatTenths } from './format-stats'

describe('formatTenths', () => {
  it('always shows one decimal of seconds', () => {
    expect(formatTenths(0)).toBe('0.0s')
    expect(formatTenths(12.34)).toBe('12.3s')
    expect(formatTenths(59.96)).toBe('1m 00.0s')
    expect(formatTenths(65.2)).toBe('1m 05.2s')
    expect(formatTenths(3725.5)).toBe('1h 02m 05.5s')
  })
})
