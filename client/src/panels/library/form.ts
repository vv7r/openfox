export type ToolSelection = Map<string, Set<string>>
export type McpMode = 'all' | 'none' | 'partial'

const MCP_NONE = '__mcp_none__'

function slugify(name: string, separator: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, separator)
    .replace(new RegExp(`^${separator}|${separator}$`, 'g'), '')
}

export function agentSlug(name: string): string {
  const slug = slugify(name, '_')
  return slug ? `custom-${slug}` : ''
}

export function commandSlug(name: string): string {
  return slugify(name, '-')
}

/** "tool:a,b" limits a tool to some actions; "tool" allows it whole. */
export function parseAllowedTools(tools: string[]): ToolSelection {
  const selection: ToolSelection = new Map()
  for (const entry of tools) {
    const colon = entry.indexOf(':')
    if (colon === -1) selection.set(entry, new Set())
    else
      selection.set(
        entry.slice(0, colon),
        new Set(
          entry
            .slice(colon + 1)
            .split(',')
            .filter(Boolean),
        ),
      )
  }
  return selection
}

export function serializeTools(selection: ToolSelection): string[] {
  return [...selection].map(([tool, actions]) => (actions.size === 0 ? tool : `${tool}:${[...actions].join(',')}`))
}

export function mcpModeOf(selection: ToolSelection, mcpNames: ReadonlySet<string>): McpMode {
  if (selection.has(MCP_NONE)) return 'none'
  return [...selection.keys()].some((name) => mcpNames.has(name)) ? 'partial' : 'all'
}

export function setMcpMode(selection: ToolSelection, mcpNames: ReadonlySet<string>, mode: McpMode): ToolSelection {
  const next: ToolSelection = new Map([...selection].filter(([name]) => name !== MCP_NONE && !mcpNames.has(name)))
  if (mode === 'none') next.set(MCP_NONE, new Set())
  if (mode === 'partial') for (const name of mcpNames) next.set(name, new Set())
  return next
}
