// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { activeTrigger, applySuggestion, remainingParams } from './suggestions'

describe('activeTrigger', () => {
  it('finds a slash command only at the very start', () => {
    expect(activeTrigger('/bui', 4)).toMatchObject({ kind: 'slash', query: 'bui' })
    expect(activeTrigger('a /bui', 6)).toBeNull()
    expect(activeTrigger('/build now', 10)).toBeNull()
  })

  it('finds a mention after whitespace but not inside a word', () => {
    expect(activeTrigger('see @src/a', 10)).toMatchObject({ kind: 'mention', query: 'src/a', start: 4 })
    expect(activeTrigger('mail@host', 9)).toBeNull()
  })

  it('reads the text before the cursor only', () => {
    expect(activeTrigger('@ab later', 3)).toMatchObject({ kind: 'mention', query: 'ab' })
  })
})

describe('applySuggestion', () => {
  it('replaces the typed token and keeps the rest', () => {
    const trigger = activeTrigger('see @ab tail', 7)!
    expect(applySuggestion('see @ab tail', trigger, '@src/ab.ts ')).toEqual({
      text: 'see @src/ab.ts  tail',
      cursor: 15,
    })
  })
})

describe('remainingParams', () => {
  it('counts the parameters still to type', () => {
    expect(remainingParams('/review', ['a', 'b'])).toBe(2)
    expect(remainingParams('/review ', ['a', 'b'])).toBe(2)
    expect(remainingParams('/review one', ['a', 'b'])).toBe(1)
    expect(remainingParams('/review one two three', ['a', 'b'])).toBe(0)
  })
})
