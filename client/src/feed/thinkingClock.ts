// The virtualized feed unmounts rows scrolled out of view: the clock must outlive them
const startedAt = new Map<string, number>()

export function thinkingSeconds(messageId: string, now: number): number {
  const start = startedAt.get(messageId) ?? now
  startedAt.set(messageId, start)
  return (now - start) / 1000
}

export const forgetThinking = (messageId: string): void => void startedAt.delete(messageId)
