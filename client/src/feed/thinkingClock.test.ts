// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { forgetThinking, stopThinking, thinkingDuration, thinkingSeconds } from './thinkingClock'

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

describe('stopThinking', () => {
  it('freezes the clock where thinking ended, so the duration stays readable', () => {
    thinkingSeconds('c', 1000)
    stopThinking('c', 3250)
    expect(thinkingSeconds('c', 9000)).toBe(2.25)
    expect(thinkingDuration('c')).toBe(2.25)
    expect(thinkingDuration('never-seen')).toBeUndefined()
  })
})
