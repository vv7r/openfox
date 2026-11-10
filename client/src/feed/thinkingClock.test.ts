// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { forgetThinking, thinkingSeconds } from './thinkingClock'

describe('thinkingSeconds', () => {
  it('counts from the first time a message is seen thinking', () => {
    expect(thinkingSeconds('a', 1000)).toBe(0)
    expect(thinkingSeconds('a', 4500)).toBe(3.5)
  })

  it('keeps its start when the row is rendered again, until forgotten', () => {
    thinkingSeconds('b', 1000)
    expect(thinkingSeconds('b', 3000)).toBe(2)
    forgetThinking('b')
    expect(thinkingSeconds('b', 9000)).toBe(0)
  })
})
