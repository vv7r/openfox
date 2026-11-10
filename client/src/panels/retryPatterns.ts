export interface RetryPattern {
  field: 'thinking' | 'content' | 'both'
  pattern: string
  action: 'retry'
  active: boolean
}

export interface RetryPatterns {
  patterns: RetryPattern[]
  maxRetriesPerTurn: number
}

export const MAX_RETRIES_PER_TURN = 100
const DEFAULT_RETRIES = 10

export const clampRetries = (value: number): number =>
  Number.isFinite(value) ? Math.min(MAX_RETRIES_PER_TURN, Math.max(1, Math.round(value))) : DEFAULT_RETRIES

export function isValidRegex(pattern: string): boolean {
  if (pattern.trim() === '') return false
  try {
    new RegExp(pattern)
    return true
  } catch {
    return false
  }
}

export function parseRetryPatterns(setting: string): RetryPatterns {
  try {
    const parsed = JSON.parse(setting || '{}') as Partial<RetryPatterns>
    return {
      patterns: Array.isArray(parsed.patterns) ? parsed.patterns : [],
      maxRetriesPerTurn: parsed.maxRetriesPerTurn ?? DEFAULT_RETRIES,
    }
  } catch {
    return { patterns: [], maxRetriesPerTurn: DEFAULT_RETRIES }
  }
}

/** What goes to the server: a half-typed regex must not reach the agent. */
export const serializeRetryPatterns = (value: RetryPatterns): RetryPatterns => ({
  ...value,
  patterns: value.patterns.filter((item) => isValidRegex(item.pattern)),
})
