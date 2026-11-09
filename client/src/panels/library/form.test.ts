import { describe, expect, it } from 'vitest'
import { agentSlug, commandSlug, parseAllowedTools, serializeTools, setMcpMode, mcpModeOf } from './form'

describe('slugs', () => {
  it('prefixes custom agents with underscores', () => {
    expect(agentSlug('My  Agent!')).toBe('custom-my_agent')
    expect(agentSlug('!!!')).toBe('')
  })

  it('uses dashes for commands', () => {
    expect(commandSlug('Fix All Bugs')).toBe('fix-all-bugs')
  })
})

describe('allowed tools', () => {
  it('round-trips plain tools and action lists', () => {
    const tools = ['read_file', 'git:status,diff']
    const parsed = parseAllowedTools(tools)
    expect([...parsed.get('git')!]).toEqual(['status', 'diff'])
    expect(parsed.get('read_file')!.size).toBe(0)
    expect(serializeTools(parsed)).toEqual(tools)
  })
})

describe('MCP tool mode', () => {
  const names = new Set(['mcp_a', 'mcp_b'])

  it('detects the mode from the selection', () => {
    expect(mcpModeOf(new Map([['read', new Set()]]), names)).toBe('all')
    expect(mcpModeOf(new Map([['__mcp_none__', new Set()]]), names)).toBe('none')
    expect(mcpModeOf(new Map([['mcp_a', new Set()]]), names)).toBe('partial')
  })

  it('replaces only the MCP entries', () => {
    const base = new Map([
      ['read', new Set(['x'])],
      ['mcp_a', new Set<string>()],
    ])
    expect([...setMcpMode(base, names, 'all').keys()]).toEqual(['read'])
    expect([...setMcpMode(base, names, 'none').keys()]).toEqual(['read', '__mcp_none__'])
    expect([...setMcpMode(base, names, 'partial').keys()]).toEqual(['read', 'mcp_a', 'mcp_b'])
  })
})
