// The virtualized feed unmounts rows scrolled out of view: the clock must outlive them
// shortcut: entries are never pruned (a few bytes per thinking message), prune if sessions get huge
const startedAt = new Map<string, number>()
const endedAt = new Map<string, number>()

export function thinkingSeconds(messageId: string, now: number): number {
  const start = startedAt.get(messageId) ?? now
  startedAt.set(messageId, start)
  return ((endedAt.get(messageId) ?? now) - start) / 1000
}

/** Freezes the clock, so the finished block still says how long it thought. */
export function stopThinking(messageId: string, now: number): void {
  if (startedAt.has(messageId) && !endedAt.has(messageId)) endedAt.set(messageId, now)
}

export function thinkingDuration(messageId: string): number | undefined {
  const start = startedAt.get(messageId)
  const end = endedAt.get(messageId)
  return start === undefined || end === undefined ? undefined : (end - start) / 1000
}

export const forgetThinking = (messageId: string): void => {
  startedAt.delete(messageId)
  endedAt.delete(messageId)
}
