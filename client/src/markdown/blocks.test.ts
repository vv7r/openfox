// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { scanBlocks } from './blocks'

describe('scanBlocks', () => {
  it('keeps an unfinished paragraph open', () => {
    expect(scanBlocks('still writing', 0)).toEqual({ offset: 0, blocks: [] })
  })

  it('waits for the line after a blank line before closing a block', () => {
    expect(scanBlocks('one\n\n', 0).blocks).toEqual([])
    const scan = scanBlocks('one\n\nt', 0)
    expect(scan.blocks).toEqual(['one'])
    expect(scan.offset).toBe(5)
  })

  it('does not split inside a fenced code block', () => {
    const text = '```ts\nconst a = 1\n\nconst b = 2\n'
    expect(scanBlocks(text, 0).blocks).toEqual([])
  })

  it('closes a block as soon as its fence closes', () => {
    const text = '```ts\na\n\nb\n```\nnext'
    expect(scanBlocks(text, 0).blocks).toEqual(['```ts\na\n\nb\n```'])
  })

  it('separates a paragraph from the fence that follows it', () => {
    expect(scanBlocks('intro\n```\nx\n```\n', 0).blocks).toEqual(['intro', '```\nx\n```'])
  })

  it('keeps indented list content with its list item', () => {
    expect(scanBlocks('- a\n\n  more\n\nnext', 0).blocks).toEqual(['- a\n\n  more'])
  })

  it('resumes from a previous offset without repeating blocks', () => {
    const first = scanBlocks('one\n\ntwo', 0)
    const second = scanBlocks('one\n\ntwo\n\nthree', first.offset)
    expect(second.blocks).toEqual(['two'])
  })
})
