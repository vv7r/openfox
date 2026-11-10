// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { getJson } from '../api'
import { joinSetup, loadWorkspaceConfig, splitSetup, toggleServerOverride, toggleToolOverride } from './projectSettings'

vi.mock('../api', () => ({ getJson: vi.fn() }))

describe('loadWorkspaceConfig', () => {
  it('reads the config out of the server envelope', async () => {
    vi.mocked(getJson).mockResolvedValueOnce({ config: { setup: ['npm ci'], rootDir: '/w' } })
    await expect(loadWorkspaceConfig('/a b')).resolves.toEqual({ setup: ['npm ci'], rootDir: '/w' })
    expect(getJson).toHaveBeenCalledWith('/api/workspace/config?workdir=%2Fa%20b')
  })

  it('is empty when the project has none or the request fails', async () => {
    vi.mocked(getJson).mockResolvedValueOnce({ config: null })
    await expect(loadWorkspaceConfig('/a')).resolves.toEqual({})
    vi.mocked(getJson).mockRejectedValueOnce(new Error('down'))
    await expect(loadWorkspaceConfig('/a')).resolves.toEqual({})
  })
})

describe('workspace setup commands', () => {
  it('splits on && and drops blanks', () => {
    expect(splitSetup(' npm ci &&  npm run build && ')).toEqual(['npm ci', 'npm run build'])
    expect(splitSetup('   ')).toEqual([])
  })

  it('joins back to one line', () => {
    expect(joinSetup(['a', 'b'])).toBe('a && b')
    expect(joinSetup(undefined)).toBe('')
  })
})

describe('MCP overrides', () => {
  it('keeps the disabled tools when the server flips', () => {
    expect(toggleServerOverride({ s: { disabledTools: ['t'] } }, 's', true)).toEqual({
      s: { disabled: true, disabledTools: ['t'] },
    })
  })

  it('adds a tool, then removes the key when none is left', () => {
    const added = toggleToolOverride({}, 's', 't')
    expect(added).toEqual({ s: { disabledTools: ['t'] } })
    expect(toggleToolOverride(added, 's', 't')).toEqual({ s: {} })
  })
})
