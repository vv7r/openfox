import presets from './presets.json'
import type { ThemeLibrary, UserThemePreset } from './theme'

type Tokens = Record<string, string>

export const DEFAULT_DARK_THEME = 'nord'
export const DEFAULT_LIGHT_THEME = 'solarized-light'

const byId = new Map<string, Tokens>(presets.presets.map((preset) => [preset.id, preset.tokens as Tokens]))

function presetTokens(id: string | undefined, users: UserThemePreset[] | undefined): Tokens | undefined {
  if (!id) return undefined
  const user = users?.find((preset) => preset.id === id)
  return user ? { ...byId.get(user.basePreset), ...user.tokens } : byId.get(id)
}

/** The tokens a saved `display.theme` value stands for; a theme that no longer exists gets the default. */
export function resolveTokens(
  saved: string | null | undefined,
  prefersDark: boolean,
  library: ThemeLibrary = {},
): Tokens {
  const fallback = byId.get(prefersDark ? DEFAULT_DARK_THEME : DEFAULT_LIGHT_THEME) ?? {}
  if (!saved) return fallback
  try {
    const parsed = (saved[0] === '{' ? JSON.parse(saved) : { preset: saved }) as { preset?: string; tokens?: Tokens }
    const systemId = prefersDark
      ? (library.prefs?.darkPreset ?? DEFAULT_DARK_THEME)
      : (library.prefs?.lightPreset ?? DEFAULT_LIGHT_THEME)
    const id = parsed.preset === 'system' ? systemId : parsed.preset
    return { ...fallback, ...presetTokens(id, library.users), ...parsed.tokens }
  } catch {
    return fallback
  }
}
