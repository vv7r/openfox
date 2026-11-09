import presets from './presets.json'

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

interface ThemeLibrary {
  users?: UserThemePreset[]
  prefs?: SystemPrefs
}

const STORAGE_KEY = 'openfox:theme'
const USERS_STORAGE_KEY = 'openfox:userPresets'
const PREFS_STORAGE_KEY = 'openfox:systemThemePrefs'
export const USER_PRESETS_KEY = 'display.userPresets'
export const SYSTEM_PREFS_KEY = 'display.systemThemePrefs'
const byId = new Map<string, Tokens>(presets.presets.map((preset) => [preset.id, preset.tokens as Tokens]))

function presetTokens(id: string | undefined, users: UserThemePreset[] | undefined): Tokens | undefined {
  if (!id) return undefined
  const user = users?.find((preset) => preset.id === id)
  return user ? { ...byId.get(user.basePreset), ...user.tokens } : byId.get(id)
}

/** The tokens a saved `display.theme` value stands for. */
export function resolveTokens(
  saved: string | null | undefined,
  prefersDark: boolean,
  library: ThemeLibrary = {},
): Tokens {
  const fallback = byId.get(prefersDark ? 'dark' : 'light') ?? {}
  if (!saved) return fallback
  try {
    const parsed = (saved[0] === '{' ? JSON.parse(saved) : { preset: saved }) as { preset?: string; tokens?: Tokens }
    const systemId = prefersDark ? (library.prefs?.darkPreset ?? 'dark') : (library.prefs?.lightPreset ?? 'light')
    const id = parsed.preset === 'system' ? systemId : parsed.preset
    return { ...fallback, ...presetTokens(id, library.users), ...parsed.tokens }
  } catch {
    return fallback
  }
}

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
    systemScheme.addEventListener('change', () => apply(lastSaved))
  }
  return systemScheme
}

function apply(saved: string | null | undefined): void {
  lastSaved = saved
  const tokens = resolveTokens(saved, scheme().matches, readLibrary())
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

/** Keeps the custom themes and system choices the first paint needs next to the theme itself. */
export function applyThemeLibrary(users: string | undefined, prefs: string | undefined): void {
  try {
    if (users) localStorage.setItem(USERS_STORAGE_KEY, users)
    if (prefs) localStorage.setItem(PREFS_STORAGE_KEY, prefs)
  } catch {
    // The server values come back on the next load
  }
}
