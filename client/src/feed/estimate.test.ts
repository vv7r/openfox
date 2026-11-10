// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { Message } from '@shared/types.js'
import { estimateItemHeight } from './estimate'

const WIDTH = 360
const message = (extra: Partial<Message>): Message =>
  ({ id: 'm', role: 'assistant', content: '', timestamp: '', ...extra }) as Message
const estimate = (extra: Partial<Message>) =>
  estimateItemHeight({ kind: 'message', key: 'm', id: 'm' }, { m: message(extra) }, WIDTH)

describe('estimateItemHeight', () => {
  it('grows with the text, wrapped to the feed width', () => {
    const short = estimate({ content: 'Bonjour' })
    const long = estimate({ content: 'mot '.repeat(400) })
    expect(long).toBeGreaterThan(short * 10)
  })

  it('counts each line of a code block without wrapping it', () => {
    const code = estimate({ content: '```js\n' + `${'x'.repeat(200)}\n`.repeat(10) + '```' })
    const prose = estimate({ content: `${'x'.repeat(200)}\n\n`.repeat(10) })
    expect(code).toBeLessThan(prose)
  })

  it('adds a row per tool call', () => {
    const calls = [1, 2, 3].map((n) => ({ id: `c${n}`, name: 'read_file', arguments: {} }))
    expect(estimate({ toolCalls: calls }) - estimate({ toolCalls: calls.slice(0, 1) })).toBeGreaterThan(60)
  })

  it('keeps a folded system prompt and a divider to one line', () => {
    const prompt = estimate({
      role: 'user',
      isSystemGenerated: true,
      messageKind: 'auto-prompt',
      content: 'x'.repeat(5000),
    })
    expect(prompt).toBeLessThan(60)
    expect(estimateItemHeight({ kind: 'divider', key: 'd' }, {}, WIDTH)).toBeLessThan(60)
  })
})
