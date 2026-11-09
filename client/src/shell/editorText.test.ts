import { describe, expect, it } from 'vitest'
import { changeBetween, detectEol, normalizeEol } from './editorText'

describe('detectEol', () => {
  it('keeps LF by default', () => expect(detectEol('no line break')).toBe('\n'))
  it('recognises a CRLF file', () => expect(detectEol('a\r\nb\r\n')).toBe('\r\n'))
  it('follows the majority of a mixed file', () => {
    expect(detectEol('a\r\nb\r\nc\n')).toBe('\r\n')
    expect(detectEol('a\nb\nc\r\n')).toBe('\n')
  })
})

describe('normalizeEol', () => {
  it('turns every line break into LF', () => expect(normalizeEol('a\r\nb\rc\n')).toBe('a\nb\nc\n'))
})

describe('changeBetween', () => {
  const apply = (before: string, after: string) => {
    const change = changeBetween(before, after)
    return change ? before.slice(0, change.from) + change.insert + before.slice(change.to) : before
  }

  it('returns nothing for identical text', () => expect(changeBetween('same', 'same')).toBeNull())

  it('only touches what differs', () => {
    expect(changeBetween('one two three', 'one 2 three')).toEqual({ from: 4, to: 7, insert: '2' })
  })

  it('handles an insertion and a deletion', () => {
    expect(changeBetween('ab', 'axb')).toEqual({ from: 1, to: 1, insert: 'x' })
    expect(changeBetween('axb', 'ab')).toEqual({ from: 1, to: 2, insert: '' })
  })

  it('does not count repeated text twice', () => {
    expect(apply('aaa', 'aa')).toBe('aa')
    expect(apply('aa', 'aaa')).toBe('aaa')
    expect(apply('abab', 'ab')).toBe('ab')
  })

  it('replaces everything when nothing is shared', () => expect(apply('abc', 'xyz')).toBe('xyz'))
  it('handles empty text', () => {
    expect(apply('', 'new')).toBe('new')
    expect(apply('old', '')).toBe('')
  })
})
