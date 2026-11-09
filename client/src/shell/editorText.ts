export type Eol = '\n' | '\r\n'

/** The editor stores LF only, so saving must put back the line endings the file uses. */
export function detectEol(text: string): Eol {
  const crlf = text.split('\r\n').length - 1
  const lf = text.split('\n').length - 1
  return crlf * 2 > lf ? '\r\n' : '\n'
}

export function normalizeEol(text: string): string {
  return text.replace(/\r\n?/g, '\n')
}

export interface TextChange {
  from: number
  to: number
  insert: string
}

/** The smallest single replacement, so text from disk leaves the cursor and scroll alone. */
export function changeBetween(before: string, after: string): TextChange | null {
  if (before === after) return null
  const shortest = Math.min(before.length, after.length)
  let prefix = 0
  while (prefix < shortest && before[prefix] === after[prefix]) prefix++
  let suffix = 0
  while (suffix < shortest - prefix && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) {
    suffix++
  }
  return { from: prefix, to: before.length - suffix, insert: after.slice(prefix, after.length - suffix) }
}
