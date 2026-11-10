// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { SessionSummary } from '@shared/types.js'
import { fuzzyMatch, searchSessions } from './homeSearch'

const session = (id: string, title: string, prompts: string[] = [], updatedAt = '2026-01-01') =>
  ({
    id,
    title,
    projectId: 'p',
    updatedAt,
    recentUserPrompts: prompts.map((content) => ({ content })),
  }) as unknown as SessionSummary

describe('fuzzyMatch', () => {
  it('needs every part of the query, letters in order within one word', () => {
    expect(fuzzyMatch('fix terminal prompt', 'trm')).toBe(true)
    expect(fuzzyMatch('fix terminal prompt', 'fix prm')).toBe(true)
    expect(fuzzyMatch('fix terminal prompt', 'mrt')).toBe(false)
  })
})

describe('searchSessions', () => {
  it('ranks title matches above prompt matches and shows a snippet for prompts', () => {
    const hits = searchSessions(
      [session('a', 'other', ['please fix the login form today']), session('b', 'login page')],
      'login',
      () => 'proj',
    )
    expect(hits.map((hit) => hit.session.id)).toEqual(['b', 'a'])
    expect(hits[1]!.snippet).toContain('login')
  })

  it('breaks ties with the most recent session and finds nothing otherwise', () => {
    const hits = searchSessions([session('old', 'alpha'), session('new', 'alpha', [], '2026-06-01')], 'alpha', () => '')
    expect(hits.map((hit) => hit.session.id)).toEqual(['new', 'old'])
    expect(searchSessions([session('a', 'alpha')], 'zzz', () => '')).toEqual([])
  })
})
