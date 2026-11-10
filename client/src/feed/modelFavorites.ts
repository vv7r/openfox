/** Provider ids never contain a slash, model ids often do. */
export const favoriteKey = (providerId: string, modelId: string): string => `${providerId}/${modelId}`

export function splitFavorite(key: string): { providerId: string; modelId: string } {
  const at = key.indexOf('/')
  return { providerId: key.slice(0, at), modelId: key.slice(at + 1) }
}

export function parseFavorites(setting: string | undefined): string[] {
  try {
    const parsed: unknown = JSON.parse(setting || '[]')
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

export const toggleFavorite = (favorites: string[], key: string): string[] =>
  favorites.includes(key) ? favorites.filter((item) => item !== key) : [...favorites, key]
