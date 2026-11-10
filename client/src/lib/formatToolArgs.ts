/**
 * Format tool arguments for display in a concise way.
 * Shows the most relevant argument for each tool type.
 */
export function formatToolArgs(tool: string, args: Record<string, unknown>): string {
  // Read file - show path with offset/limit params when non-default
  if (tool === 'read_file') {
    const path = String(args.path ?? '')
    const offset = args.offset as number | undefined
    const limit = args.limit as number | undefined
    const params = []
    if (offset !== undefined && offset !== 1) params.push(`offset=${offset}`)
    if (limit !== undefined) params.push(`limit=${limit}`)
    return params.length > 0 ? `${path} [${params.join(', ')}]` : path
  }

  // Describe image - show path with the question
  if (tool === 'describe_image') {
    const path = String(args.path ?? '')
    const question = String(args.question ?? '')
    const short = question.length > 40 ? question.slice(0, 37) + '…' : question
    return short ? `${path} — ${short}` : path
  }

  // Other file operations - show path
  if (tool === 'write_file' || tool === 'edit_file') {
    return String(args.path ?? '')
  }

  // Command execution - show command
  if (tool === 'run_command' || tool === 'bash') {
    return String(args.command ?? '')
  }

  // Return value - show truncated content preview
  if (tool === 'return_value') {
    const content = String(args.content ?? '')
    return content.length > 60 ? content.slice(0, 60) + '...' : content
  }

  // Sub-agent call - show sub-agent type
  if (tool === 'call_sub_agent') {
    return String(args.subAgentType ?? '')
  }

  // Load skill - show skill ID
  if (tool === 'load_skill') {
    return String(args.skillId ?? '')
  }

  // Web fetch - show URL
  if (tool === 'web_fetch') {
    return String(args.url ?? '')
  }

  // Web search - show query
  if (tool === 'web_search') {
    const query = String(args.query ?? '')
    return query.length > 60 ? query.slice(0, 57) + '...' : query
  }

  // Dev server - show action
  if (tool === 'dev_server') {
    return String(args.action ?? '')
  }

  // Background process - show action and optional name
  if (tool === 'background_process') {
    const action = String(args.action ?? '')
    const name = args.name ? String(args.name) : ''
    return name ? `${action}: ${name}` : action
  }

  // MCP config - show action
  if (tool === 'mcp_config') {
    return String(args.action ?? '')
  }

  // Project tasks - show action, with the target task when present
  if (tool === 'project_tasks') {
    const action = String(args.action ?? '')
    const taskId = args.taskId ? String(args.taskId) : ''
    let label = taskId ? `${action}: ${taskId}` : action
    if (action === 'move' && args.to) label += ` → ${String(args.to)}`
    if (action === 'set_gate_value' && args.gateId) label += ` (${String(args.gateId)})`
    if (action === 'get_attachment' && args.attachmentId) label += ` (${String(args.attachmentId)})`
    return label
  }

  return summarizeArgs(args)
}

/** Arguments that say most about a call, in the order they are worth showing first. */
const LEADING_ARGS = ['path', 'file', 'command', 'query', 'url', 'pattern', 'prefix', 'name', 'id', 'action']
const MAX_SIDE_VALUE = 30
const SEPARATOR = '  ·  '

const shorten = (value: string): string =>
  value.length > MAX_SIDE_VALUE ? `${value.slice(0, MAX_SIDE_VALUE - 1)}…` : value

/** A tool with no rule of its own: its main argument, then the other short ones by name. */
function summarizeArgs(args: Record<string, unknown>): string {
  const scalars = Object.entries(args).filter(
    ([, value]) => ['string', 'number', 'boolean'].includes(typeof value) && String(value) !== '',
  )
  const lead = LEADING_ARGS.find((key) => scalars.some(([name]) => name === key)) ?? scalars[0]?.[0]
  if (lead === undefined) return ''
  const rest = scalars.filter(([name]) => name !== lead).map(([name, value]) => `${name} ${shorten(String(value))}`)
  return [String(args[lead]), ...rest].join(SEPARATOR)
}

/** MCP tools reach the agent as `<server>_<tool>`: shown apart, the tool keeps its own name. */
export function splitToolName(name: string, servers: readonly string[]): { name: string; server?: string } {
  const server = servers
    .filter((candidate) => name.startsWith(`${candidate}_`) && name.length > candidate.length + 1)
    .sort((a, b) => b.length - a.length)[0]
  return server ? { name: name.slice(server.length + 1), server } : { name }
}

/**
 * Format tool arguments with metadata for enhanced display.
 * Includes structured metadata like counts and truncation status.
 */
export function formatToolArgsWithMetadata(
  tool: string,
  args: Record<string, unknown>,
  metadata?: Record<string, unknown>,
): string {
  const base = formatToolArgs(tool, args)

  // Enrich with metadata when available
  if (tool === 'read_file' && metadata) {
    const format = metadata.format as string | undefined
    const pageCount = metadata.pageCount as number | undefined
    if (format === 'pdf' && pageCount != null) {
      return `${base} (PDF, ${pageCount}p)`
    }
    if (format === 'image') {
      return `${base} (image)`
    }
  }

  if (tool === 'web_fetch' && metadata) {
    const contentType = metadata.contentType as string | undefined
    if (contentType) {
      const shortType = contentType.split(';')[0]?.trim() ?? ''
      if (shortType && shortType !== 'text/html') {
        return `${base} (${shortType})`
      }
    }
  }

  return base
}

/**
 * Format args for full display (no truncation, pretty printed)
 */
export function formatToolArgsFull(args: Record<string, unknown>): string {
  return JSON.stringify(args, null, 2)
}
