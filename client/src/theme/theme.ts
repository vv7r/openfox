type Tokens = Record<string, string>

export interface UserThemePreset {
  id: string
  name: string
  basePreset: string
  mode?: 'dark' | 'light'
  tokens: Tokens
}

export interface SystemPrefs {
  darkPreset: string
  lightPreset: string
}

export interface ThemeLibrary {
  users?: UserThemePreset[]
  prefs?: SystemPrefs
}

const STORAGE_KEY = 'openfox:theme'
/** The resolved colours: the first paint must not wait for the list of themes. */
const TOKENS_STORAGE_KEY = 'openfox:theme-tokens'
const USERS_STORAGE_KEY = 'openfox:userPresets'
const PREFS_STORAGE_KEY = 'openfox:systemThemePrefs'
export const USER_PRESETS_KEY = 'display.userPresets'
export const SYSTEM_PREFS_KEY = 'display.systemThemePrefs'
function readLibrary(): ThemeLibrary {
  try {
    const users = localStorage.getItem(USERS_STORAGE_KEY)
    const prefs = localStorage.getItem(PREFS_STORAGE_KEY)
    return {
      ...(users ? { users: JSON.parse(users) as UserThemePreset[] } : {}),
      ...(prefs ? { prefs: JSON.parse(prefs) as SystemPrefs } : {}),
    }
  } catch {
    return {}
  }
}

let systemScheme: MediaQueryList | null = null
let lastSaved: string | null | undefined

function scheme(): MediaQueryList {
  if (!systemScheme) {
    systemScheme = matchMedia('(prefers-color-scheme: dark)')
    systemScheme.addEventListener('change', () => void apply(lastSaved))
  }
  return systemScheme
}

function toneOf(background: string | undefined): 'dark' | 'light' {
  const [red = 0, green = 0, blue = 0] = (background ?? '').trim().split(/\s+/).map(Number)
  return red * 0.299 + green * 0.587 + blue * 0.114 < 128 ? 'dark' : 'light'
}

function paint(tokens: Tokens): void {
  const root = document.documentElement
  for (const [key, value] of Object.entries(tokens)) root.style.setProperty(`--${key}`, value)
  const tone = toneOf(tokens['color-primary'])
  root.dataset['tone'] = tone
  root.style.colorScheme = tone
}

let applying = 0

async function apply(saved: string | null | undefined): Promise<void> {
  lastSaved = saved
  const run = ++applying
  try {
    const { resolveTokens } = await import('./resolve')
    if (run !== applying) return
    const tokens = resolveTokens(saved, scheme().matches, readLibrary())
    paint(tokens)
    localStorage.setItem(TOKENS_STORAGE_KEY, JSON.stringify(tokens))
  } catch {
    // The colours already on screen stay until the next load
  }
}

export function applyCachedTheme(): void {
  let saved: string | null = null
  try {
    const tokens = localStorage.getItem(TOKENS_STORAGE_KEY)
    if (tokens) paint(JSON.parse(tokens) as Tokens)
    saved = localStorage.getItem(STORAGE_KEY)
  } catch {
    // Falls back to the stylesheet's colours until the theme resolves
  }
  void apply(saved)
}

export function applyTheme(saved: string | undefined): void {
  if (!saved) return
  void apply(saved)
  try {
    localStorage.setItem(STORAGE_KEY, saved)
  } catch {
    // Only costs a theme flash on the next load
  }
}

/** Keeps the custom themes and system choices the first paint needs next to the theme itself. */
export function applyThemeLibrary(users: string | undefined, prefs: string | undefined): void {
  try {
    if (users) localStorage.setItem(USERS_STORAGE_KEY, users)
    if (prefs) localStorage.setItem(PREFS_STORAGE_KEY, prefs)
  } catch {
    // The server values come back on the next load
  }
}
