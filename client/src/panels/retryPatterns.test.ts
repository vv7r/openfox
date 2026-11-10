// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { clampRetries, isValidRegex, parseRetryPatterns, serializeRetryPatterns } from './retryPatterns'

describe('retry patterns', () => {
  it('rejects empty and broken expressions', () => {
    expect(isValidRegex('a+')).toBe(true)
    expect(isValidRegex('   ')).toBe(false)
    expect(isValidRegex('(')).toBe(false)
  })

  it('reads a bad setting as an empty list', () => {
    expect(parseRetryPatterns('{').patterns).toEqual([])
    expect(parseRetryPatterns('').maxRetriesPerTurn).toBe(10)
  })

  it('drops invalid expressions when saving', () => {
    const saved = serializeRetryPatterns({
      maxRetriesPerTurn: 2,
      patterns: [
        { field: 'content', pattern: 'ok', action: 'retry', active: true },
        { field: 'content', pattern: '(', action: 'retry', active: true },
      ],
    })
    expect(saved.patterns.map((item) => item.pattern)).toEqual(['ok'])
  })

  it('keeps the retry count in range', () => {
    expect(clampRetries(999)).toBe(100)
    expect(clampRetries(-1)).toBe(1)
    expect(clampRetries(Number.NaN)).toBe(10)
  })
})
