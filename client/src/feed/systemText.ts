const WRAPPER = /^\s*<system-reminder>\s*|\s*<\/system-reminder>\s*$/g
const TAG = /<\/?[a-z][a-z0-9-]*>/gi

/**
 * A prompt OpenFox adds for the model, as a person reads it: without the wrapper tags, and
 * with a tag the text names shown as code instead of being swallowed as HTML.
 */
export function readableReminder(text: string): string {
  return text
    .replace(WRAPPER, '')
    .replace(TAG, (tag) => `\`${tag}\``)
    .trim()
}

/** Tool output that is a JSON object or array, indented; anything else as it came. */
export function prettyJson(text: string): string {
  try {
    const value: unknown = JSON.parse(text)
    return value !== null && typeof value === 'object' ? JSON.stringify(value, null, 2) : text
  } catch {
    return text
  }
}
