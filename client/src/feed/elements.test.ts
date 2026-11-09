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

describe('criteria grouping', () => {
  const call = (id: string, name: string) => ({ id, name, arguments: {} })

  it('joins consecutive criterion calls and in-flight additions', () => {
    const { elements } = toElements({
      toolCalls: [call('a', 'criterion'), call('b', 'session_metadata')],
      preparingToolCalls: [{ index: 0, name: 'session_metadata', arguments: '{"action":"add","key":"x"' }],
    } as unknown as Parameters<typeof toElements>[0])
    expect(elements).toHaveLength(1)
    expect(elements[0]).toMatchObject({ type: 'criteria' })
  })

  it('starts a new group after another tool', () => {
    const { elements } = toElements({
      toolCalls: [call('a', 'criterion'), call('b', 'read_file'), call('c', 'criterion')],
    } as unknown as Parameters<typeof toElements>[0])
    expect(elements.map((element) => element.type)).toEqual(['criteria', 'tool', 'criteria'])
  })
})
