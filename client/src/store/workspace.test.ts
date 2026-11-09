// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GitStatusPayload } from '@shared/protocol.js'

const getJson = vi.fn()
vi.mock('../api', () => ({ getJson: (url: string) => getJson(url) }))

import {
  closeTab,
  loadTree,
  openTab,
  refreshChangedTabs,
  resetWorkspace,
  selectTab,
  toggleDir,
  useWorkspace,
} from './workspace'

const flush = () => new Promise((done) => setTimeout(done, 0))
const git = (additions: number): GitStatusPayload => ({
  branch: 'main',
  diff: { files: [{ path: 'a.ts', status: 'modified', additions, deletions: 0 }] },
})

describe('workspace store', () => {
  beforeEach(() => {
    window.history.pushState(null, '', '/p/p1/s/s1')
    getJson.mockReset()
    getJson.mockResolvedValue({ path: 'a.ts', content: 'x' })
    resetWorkspace()
  })

  it('opens a tab once and loads it from the session workspace', async () => {
    openTab('file', 'a b.ts')
    openTab('file', 'a b.ts')
    await flush()
    expect(useWorkspace.getState().tabs).toHaveLength(1)
    expect(getJson).toHaveBeenCalledTimes(1)
    expect(getJson).toHaveBeenCalledWith('/api/sessions/s1/workspace/file?path=a%20b.ts')
    expect(useWorkspace.getState().contents['file:a b.ts']?.status).toBe('ready')
  })

  it('reports a failed load on the tab', async () => {
    getJson.mockRejectedValue(new Error('403'))
    openTab('file', 'a.ts')
    await flush()
    expect(useWorkspace.getState().contents['file:a.ts']?.status).toBe('error')
  })

  it('activates the neighbour when the active tab closes, then the changes list', () => {
    openTab('file', 'a')
    openTab('file', 'b')
    selectTab('file:a')
    closeTab('file:a')
    expect(useWorkspace.getState().activeKey).toBe('file:b')
    closeTab('file:b')
    expect(useWorkspace.getState().activeKey).toBeNull()
  })

  it('drops a response that arrives after the session changed', async () => {
    let answer: (value: unknown) => void = () => {}
    getJson.mockReturnValue(new Promise((done) => (answer = done)))
    void loadTree('')
    resetWorkspace()
    answer({ entries: [{ name: 'x', path: 'x', type: 'file' }] })
    await flush()
    expect(useWorkspace.getState().tree['']).toBeUndefined()
  })

  it('loads a directory only the first time it expands', async () => {
    getJson.mockResolvedValue({ entries: [] })
    toggleDir('src')
    await flush()
    toggleDir('src')
    toggleDir('src')
    expect(getJson).toHaveBeenCalledTimes(1)
  })

  it('reloads an open tab only when its file changed', async () => {
    openTab('diff', 'a.ts')
    await flush()
    getJson.mockClear()
    refreshChangedTabs(git(1))
    refreshChangedTabs(git(1))
    expect(getJson).not.toHaveBeenCalled()
    refreshChangedTabs(git(2))
    expect(getJson).toHaveBeenCalledTimes(1)
  })
})
