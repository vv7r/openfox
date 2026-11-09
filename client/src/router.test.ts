// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { parseRoute } from './router'

describe('parseRoute', () => {
  it('reads project and session ids', () => {
    expect(parseRoute('/p/a/s/b')).toEqual({ projectId: 'a', sessionId: 'b' })
    expect(parseRoute('/p/a')).toEqual({ projectId: 'a', sessionId: null })
  })

  it('treats anything else as home', () => {
    expect(parseRoute('/')).toEqual({ projectId: null, sessionId: null })
    expect(parseRoute('/settings')).toEqual({ projectId: null, sessionId: null })
  })
})
