import presets from './presets.json'

type Tokens = Record<string, string>

const STORAGE_KEY = 'openfox:theme'
const byId = new Map<string, Tokens>(presets.presets.map((preset) => [preset.id, preset.tokens as Tokens]))

/** The tokens a saved `display.theme` value stands for. */
export function resolveTokens(saved: string | null | undefined, prefersDark: boolean): Tokens {
  const fallback = byId.get(prefersDark ? 'dark' : 'light') ?? {}
  if (!saved) return fallback
  try {
    const parsed = (saved[0] === '{' ? JSON.parse(saved) : { preset: saved }) as { preset?: string; tokens?: Tokens }
    const id = parsed.preset === 'system' ? (prefersDark ? 'dark' : 'light') : parsed.preset
    return { ...fallback, ...(id ? byId.get(id) : {}), ...parsed.tokens }
  } catch {
    return fallback
  }
}

function apply(saved: string | null | undefined): void {
  const tokens = resolveTokens(saved, matchMedia('(prefers-color-scheme: dark)').matches)
  for (const [key, value] of Object.entries(tokens)) document.documentElement.style.setProperty(`--${key}`, value)
}

export function applyCachedTheme(): void {
  try {
    apply(localStorage.getItem(STORAGE_KEY))
  } catch {
    apply(null)
  }
}

export function applyTheme(saved: string | undefined): void {
  if (!saved) return
  apply(saved)
  try {
    localStorage.setItem(STORAGE_KEY, saved)
  } catch {
    // Only costs a theme flash on the next load
  }
}
