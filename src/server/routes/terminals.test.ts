import { describe, expect, it } from 'vitest'
import { terminalSize } from './terminals.js'

describe('terminalSize', () => {
  it('accepts a real size', () => expect(terminalSize({ cols: 38, rows: 14 })).toEqual({ cols: 38, rows: 14 }))

  it.each([
    [undefined],
    [{}],
    [{ cols: 38 }],
    [{ cols: 0, rows: 14 }],
    [{ cols: -1, rows: 14 }],
    [{ cols: 38.5, rows: 14 }],
    [{ cols: '38', rows: 14 }],
    [{ cols: 100000, rows: 14 }],
  ])('ignores %j', (body) => expect(terminalSize(body)).toBeUndefined())
})
