import { describe, expect, it } from 'vitest'
import { inputHeight, trimTailDeletion } from './useInputHeight'

const VIEWPORT = 1000

describe('trimTailDeletion', () => {
  it('drops the line breaks a selection from the end leaves behind', () => {
    expect(trimTailDeletion('a\nb\nc', 'a\n')).toBe('a')
    expect(trimTailDeletion('para\n\nnext\nmore', 'para\n\n')).toBe('para')
  })

  it('leaves a single character deleted on the last line alone', () => {
    expect(trimTailDeletion('a\nb', 'a\n')).toBe('a\n')
  })

  it('leaves a deletion that removed no line break alone', () => {
    expect(trimTailDeletion('a\nbcd', 'a\n')).toBe('a\n')
  })

  it('leaves one empty line removed by Backspace alone', () => {
    expect(trimTailDeletion('a\n\n', 'a\n')).toBe('a\n')
  })

  it('ignores a deletion elsewhere in the text', () => {
    expect(trimTailDeletion('a\nb\nc\n', 'c\n')).toBe('c\n')
  })

  it('ignores typing', () => expect(trimTailDeletion('a\n', 'a\nb\n')).toBe('a\nb\n'))
})

describe('inputHeight', () => {
  it('follows the text', () => expect(inputHeight(83, null, VIEWPORT)).toBe(83))
  it('stops growing at 240 px', () => expect(inputHeight(900, null, VIEWPORT)).toBe(240))
  it('stops at 35% of a small screen', () => expect(inputHeight(900, null, 400)).toBe(140))

  it('keeps the height the user chose for a short text', () => expect(inputHeight(40, 100, VIEWPORT)).toBe(100))
  it('still grows past the chosen height for a long text', () => expect(inputHeight(192, 40, VIEWPORT)).toBe(192))
  it('stays limited past the chosen height', () => expect(inputHeight(900, 100, VIEWPORT)).toBe(240))
  it('never shrinks a chosen height above the limit', () => expect(inputHeight(900, 500, VIEWPORT)).toBe(500))
})
