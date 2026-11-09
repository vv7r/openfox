export interface Suggestion {
  id: string
  label: string
  detail: string
  insert: string
}

export interface Trigger {
  kind: 'slash' | 'mention'
  start: number
  query: string
  end: number
}

/** The autocomplete being typed at the cursor, if any. */
export function activeTrigger(text: string, cursor: number): Trigger | null {
  const before = text.slice(0, cursor)
  const slash = /^\/(\S*)$/.exec(before)
  if (slash) return { kind: 'slash', start: 0, query: slash[1]!, end: cursor }
  const mention = /(?:^|\s)@(\S*)$/.exec(before)
  if (mention) return { kind: 'mention', start: cursor - mention[1]!.length - 1, query: mention[1]!, end: cursor }
  return null
}

export function applySuggestion(text: string, trigger: Trigger, insert: string): { text: string; cursor: number } {
  return {
    text: text.slice(0, trigger.start) + insert + text.slice(trigger.end),
    cursor: trigger.start + insert.length,
  }
}
