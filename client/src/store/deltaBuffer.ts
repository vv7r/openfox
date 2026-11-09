export interface PendingDelta {
  content: string
  thinking: string
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

export function bufferDelta(messageId: string, field: keyof PendingDelta, text: string): void {
  const entry = pending.get(messageId) ?? { content: '', thinking: '' }
  entry[field] += text
  pending.set(messageId, entry)
  schedule()
}

/** Applies whatever is buffered now, ahead of an update that must see it. */
export function flushDeltas(): void {
  if (frame !== null) cancelAnimationFrame(frame)
  run()
}
