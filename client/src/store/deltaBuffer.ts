export interface ToolChunk {
  callId: string
  stream: 'stdout' | 'stderr'
  content: string
}

export interface PendingDelta {
  content: string
  thinking: string
  tools: ToolChunk[]
}

const pending = new Map<string, PendingDelta>()
let flush: ((deltas: Map<string, PendingDelta>) => void) | null = null
let frame: number | null = null

export function setDeltaFlush(fn: typeof flush): void {
  flush = fn
}

function run(): void {
  frame = null
  if (pending.size === 0) return
  const batch = new Map(pending)
  pending.clear()
  flush?.(batch)
}

function schedule(): void {
  // A hidden page renders nothing: the deltas wait for visibilitychange
  if (frame === null && !document.hidden) frame = requestAnimationFrame(run)
}

document.addEventListener('visibilitychange', schedule)

function entryFor(messageId: string): PendingDelta {
  let entry = pending.get(messageId)
  if (!entry) {
    entry = { content: '', thinking: '', tools: [] }
    pending.set(messageId, entry)
  }
  return entry
}

export function bufferDelta(messageId: string, field: 'content' | 'thinking', text: string): void {
  entryFor(messageId)[field] += text
  schedule()
}

export function bufferToolOutput(messageId: string, chunk: ToolChunk): void {
  entryFor(messageId).tools.push(chunk)
  schedule()
}

/** Applies whatever is buffered now, ahead of an update that must see it. */
export function flushDeltas(): void {
  if (frame !== null) cancelAnimationFrame(frame)
  run()
}

/** Forgets everything buffered, when the feed moves to another session. */
export function clearDeltas(): void {
  if (frame !== null) cancelAnimationFrame(frame)
  frame = null
  pending.clear()
}
