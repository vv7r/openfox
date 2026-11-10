// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { formatToolArgs, splitToolName } from './formatToolArgs'

describe('splitToolName', () => {
  it('separates the MCP server from the tool it serves', () => {
    expect(splitToolName('sqz_sqz_list_dir', ['sqz'])).toEqual({ name: 'sqz_list_dir', server: 'sqz' })
  })

  it('keeps built-in tools whole', () => {
    expect(splitToolName('run_command', ['sqz'])).toEqual({ name: 'run_command' })
    expect(splitToolName('read_file', [])).toEqual({ name: 'read_file' })
  })

  it('picks the longest matching server name', () => {
    expect(splitToolName('home_lab_ping', ['home', 'home_lab'])).toEqual({ name: 'ping', server: 'home_lab' })
  })
})

describe('formatToolArgs for tools it has no rule for', () => {
  it('leads with the most telling argument, then the other short ones', () => {
    expect(formatToolArgs('sqz_sqz_list_dir', { path: '.', max_depth: 2 })).toBe('.  ·  max_depth 2')
    expect(formatToolArgs('grep', { pattern: 'shuffle', path: 'src', max_results: 20 })).toBe(
      'src  ·  pattern shuffle  ·  max_results 20',
    )
  })

  it('shows a lone argument by its value', () => {
    expect(formatToolArgs('sqz_expand', { prefix: 'a1a7212cd417b48d' })).toBe('a1a7212cd417b48d')
  })

  it('leaves out nested values and shortens long ones', () => {
    expect(formatToolArgs('x', { query: 'q', filters: { a: 1 }, note: 'n'.repeat(50) })).toBe(
      `q  ·  note ${'n'.repeat(29)}…`,
    )
  })

  it('has nothing to show without arguments', () => {
    expect(formatToolArgs('ping', {})).toBe('')
  })
})
