// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { favoriteKey, parseFavorites, splitFavorite, toggleFavorite } from './modelFavorites'

describe('model favorites', () => {
  it('keeps slashes of the model id when splitting', () => {
    expect(splitFavorite(favoriteKey('p1', 'tencent/hy4:free'))).toEqual({
      providerId: 'p1',
      modelId: 'tencent/hy4:free',
    })
  })

  it('reads only a list of strings', () => {
    expect(parseFavorites('["a", 2]')).toEqual(['a'])
    expect(parseFavorites('{')).toEqual([])
    expect(parseFavorites(undefined)).toEqual([])
    expect(parseFavorites('')).toEqual([])
  })

  it('toggles a key', () => {
    expect(toggleFavorite(['a'], 'b')).toEqual(['a', 'b'])
    expect(toggleFavorite(['a', 'b'], 'a')).toEqual(['b'])
  })
})
