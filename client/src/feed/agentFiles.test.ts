// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import type { Message } from '@shared/types.js'
import { agentFiles, isWriteCall } from './agentFiles'

const message = (id: string, extra: Partial<Message>): Message =>
  ({ id, role: 'assistant', content: '', timestamp: '', ...extra }) as Message
const call = (name: string, path: string) => ({ id: path, name, arguments: { path }, startedAt: 0 })
const feed = (...messages: Message[]) => ({
  ids: messages.map((m) => m.id),
  byId: Object.fromEntries(messages.map((m) => [m.id, m])),
})

describe('isWriteCall', () => {
  const state = feed(message('m', { toolCalls: [call('edit_file', 'a.ts'), call('read_file', 'b.ts')] }))

  it('recognises a call that wrote a file', () => expect(isWriteCall(state, 'm', 'a.ts')).toBe(true))
  it('ignores a read', () => expect(isWriteCall(state, 'm', 'b.ts')).toBe(false))
  it('ignores an unknown call', () => expect(isWriteCall(state, 'x', 'a.ts')).toBe(false))
})

describe('agentFiles', () => {
  it('lists what the agent wrote since the last user message, relative to the workspace', () => {
    const state = feed(
      message('a', { toolCalls: [call('edit_file', '/w/old.ts')] }),
      message('u', { role: 'user' }),
      message('b', { toolCalls: [call('edit_file', '/w/src/a.ts'), call('write_file', './b.ts')] }),
    )
    expect(agentFiles(state, '/w')).toEqual(['b.ts', 'src/a.ts'])
  })

  it('ignores tools that only read', () => {
    expect(agentFiles(feed(message('a', { toolCalls: [call('read_file', 'a.ts')] })), '/w')).toEqual([])
  })

  it('reads the path from a call still being streamed', () => {
    const preparing = [{ index: 0, name: 'edit_file', arguments: '{"path":"src/x.ts","old_stri' }]
    expect(agentFiles(feed(message('a', { preparingToolCalls: preparing })), '/w')).toEqual(['src/x.ts'])
  })

  it('waits for the whole path of a streaming call', () => {
    const preparing = [{ index: 0, name: 'write_file', arguments: '{"path":"src/x' }]
    expect(agentFiles(feed(message('a', { preparingToolCalls: preparing })), '/w')).toEqual([])
  })

  it('does not stop at messages the system injected during the run', () => {
    const state = feed(
      message('u', { role: 'user' }),
      message('a', { toolCalls: [call('edit_file', 'a.ts')] }),
      message('n', { role: 'user', isSystemGenerated: true }),
      message('b', { toolCalls: [call('edit_file', 'b.ts')] }),
    )
    expect(agentFiles(state, '/w')).toEqual(['a.ts', 'b.ts'])
  })
})
