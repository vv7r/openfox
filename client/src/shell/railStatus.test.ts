import { describe, expect, it } from 'vitest'
import { devServerTone, hasActiveMcp } from './railStatus'

const server = (name: string, status: string) => ({ name, status })

describe('hasActiveMcp', () => {
  it('needs a connected server', () => {
    expect(hasActiveMcp([], [])).toBe(false)
    expect(hasActiveMcp([server('a', 'disconnected'), server('b', 'error')], [])).toBe(false)
    expect(hasActiveMcp([server('a', 'connected')], [])).toBe(true)
  })

  it('ignores a server turned off for this session', () => {
    expect(hasActiveMcp([server('a', 'connected')], ['a'])).toBe(false)
    expect(hasActiveMcp([server('a', 'connected'), server('b', 'connected')], ['a'])).toBe(true)
  })
})

describe('devServerTone', () => {
  it('shows nothing when the server is off', () => expect(devServerTone('off')).toBeUndefined())
  it('maps each state to its colour', () => {
    expect(devServerTone('running')).toBe('success')
    expect(devServerTone('warning')).toBe('warning')
    expect(devServerTone('error')).toBe('error')
  })
})
