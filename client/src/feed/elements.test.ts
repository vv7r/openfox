// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { Message } from '@shared/types.js'
import { toElements } from './elements'

const base: Message = { id: 'm', role: 'assistant', content: '', timestamp: '' }
const call = { id: 'c1', name: 'read_file', arguments: {} }

describe('toElements', () => {
  it('follows segment order and joins thinking', () => {
    const { thinking, elements } = toElements({
      ...base,
      toolCalls: [call],
      segments: [
        { type: 'thinking', content: 'a' },
        { type: 'tool_call', toolCallId: 'c1' },
        { type: 'text', content: 'done' },
        { type: 'thinking', content: 'b' },
      ],
    })
    expect(thinking).toBe('ab')
    expect(elements.map((e) => e.type)).toEqual(['tool', 'text'])
  })

  it('falls back to content then tools while streaming, preparing calls last', () => {
    const { elements } = toElements({
      ...base,
      content: 'hello',
      toolCalls: [call],
      preparingToolCalls: [{ index: 1, name: 'x' }],
    })
    expect(elements.map((e) => e.type)).toEqual(['text', 'tool', 'preparing'])
  })

  it('ignores whitespace-only thinking and segments for unknown calls', () => {
    const result = toElements({
      ...base,
      segments: [
        { type: 'thinking', content: '  ' },
        { type: 'tool_call', toolCallId: 'gone' },
      ],
    })
    expect(result).toEqual({ thinking: '', elements: [] })
  })
})
