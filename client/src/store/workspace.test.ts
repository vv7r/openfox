// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GitStatusPayload } from '@shared/protocol.js'

const getJson = vi.fn()
const sendJson = vi.fn()
vi.mock('../api', () => ({
  getJson: (url: string) => getJson(url),
  sendJson: (...args: unknown[]) => sendJson(...args) as unknown,
}))

import {
  closeTab,
  CONTEXT_VIEW,
  leaveWorkspace,
  loadTree,
  onTabDisposed,
  openTab,
  refreshChangedTabs,
  refreshAfterAgentWrite,
  refreshTree,
  reloadFile,
  resetWorkspace,
  saveFile,
  selectTab,
  selectView,
  setDirty,
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
  describe('editing', () => {
    const ready = { path: 'a.ts', content: 'x', hash: 'h1', editable: true }
    const open = async () => {
      getJson.mockResolvedValue(ready)
      openTab('file', 'a.ts')
      await flush()
    }
    const respond = (status: number, body: unknown = {}) => ({ ok: status < 400, status, json: async () => body })
    const body = () => useWorkspace.getState().contents['file:a.ts']

    beforeEach(() => sendJson.mockReset())

    it('saves against the version that was loaded and keeps the new hash', async () => {
      await open()
      sendJson.mockResolvedValue(respond(200, { hash: 'h2' }))
      expect(await saveFile('file:a.ts', 'y')).toBe(true)
      expect(sendJson).toHaveBeenCalledWith('/api/sessions/s1/workspace/file?path=a.ts', 'PUT', {
        content: 'y',
        baseHash: 'h1',
      })
      expect(body()).toEqual({ status: 'ready', body: { ...ready, content: 'y', hash: 'h2' } })
    })

    it('reports a conflict, and overwriting drops the base version', async () => {
      await open()
      sendJson.mockResolvedValue(respond(409))
      expect(await saveFile('file:a.ts', 'y')).toBe(false)
      expect(useWorkspace.getState().saves['file:a.ts']).toBe('conflict')

      sendJson.mockResolvedValue(respond(200, { hash: 'h3' }))
      await saveFile('file:a.ts', 'y', true)
      expect(sendJson).toHaveBeenLastCalledWith('/api/sessions/s1/workspace/file?path=a.ts', 'PUT', { content: 'y' })
      expect(useWorkspace.getState().saves['file:a.ts']).toBeUndefined()
    })

    it('does not replace a tab with unsaved edits when the file changes on disk', async () => {
      await open()
      refreshChangedTabs(git(1))
      setDirty('file:a.ts', () => 'draft')
      getJson.mockResolvedValue({ ...ready, content: 'agent', hash: 'h9' })
      refreshChangedTabs(git(2))
      await flush()
      expect(body()).toEqual({ status: 'ready', body: ready })
    })

    it('reloading discards the draft and takes what is on disk', async () => {
      await open()
      setDirty('file:a.ts', () => 'draft')
      getJson.mockResolvedValue({ ...ready, content: 'agent', hash: 'h9' })
      expect(await reloadFile('file:a.ts')).toBe('agent')
      expect(useWorkspace.getState().dirty).toEqual({})
      expect(body()).toEqual({ status: 'ready', body: { ...ready, content: 'agent', hash: 'h9' } })
    })

    it('tells listeners when a tab goes away, and forgets its draft', async () => {
      const disposed: string[] = []
      const stop = onTabDisposed((key) => disposed.push(key))
      await open()
      setDirty('file:a.ts', () => 'draft')
      closeTab('file:a.ts')
      stop()
      expect(disposed).toEqual(['file:a.ts'])
      expect(useWorkspace.getState().dirty).toEqual({})
    })

    it('offers to save drafts when leaving, against the place they were opened', async () => {
      await open()
      setDirty('file:a.ts', () => 'draft')
      window.history.pushState(null, '', '/p/p1/s/s2')
      vi.spyOn(window, 'confirm').mockReturnValue(true)
      sendJson.mockResolvedValue(respond(200, { hash: 'h2' }))
      leaveWorkspace()
      expect(sendJson).toHaveBeenCalledWith('/api/sessions/s1/workspace/file?path=a.ts', 'PUT', {
        content: 'draft',
        baseHash: 'h1',
      })
      expect(useWorkspace.getState().tabs).toEqual([])
    })

    it('does not save drafts the user declined to keep', async () => {
      await open()
      setDirty('file:a.ts', () => 'draft')
      vi.spyOn(window, 'confirm').mockReturnValue(false)
      leaveWorkspace()
      expect(sendJson).not.toHaveBeenCalled()
    })
  })

  describe('tree refresh', () => {
    it('reloads open files and the tree when the agent finishes writing', async () => {
      getJson.mockResolvedValue({ entries: [] })
      await loadTree('')
      getJson.mockResolvedValue({ path: 'a.ts', content: 'x', hash: 'h1', editable: true })
      openTab('file', 'a.ts')
      await flush()
      getJson.mockClear()
      getJson.mockImplementation((url: string) =>
        url.includes('/tree')
          ? Promise.resolve({ entries: [] })
          : Promise.resolve({ path: 'a.ts', content: 'agent', hash: 'h2', editable: true }),
      )
      refreshAfterAgentWrite()
      await flush()
      expect(useWorkspace.getState().contents['file:a.ts']).toMatchObject({ body: { content: 'agent' } })
      expect(getJson).toHaveBeenCalledWith('/api/sessions/s1/workspace/tree?path=')
    })

    it('reloads the folders already loaded when the set of changed files moves', async () => {
      getJson.mockResolvedValue({ entries: [] })
      await loadTree('')
      refreshChangedTabs({ branch: 'main', diff: { files: [] } })
      getJson.mockClear()
      refreshChangedTabs(git(1))
      expect(getJson).toHaveBeenCalledWith('/api/sessions/s1/workspace/tree?path=')
    })

    it('leaves the tree alone when only line counts change', async () => {
      getJson.mockResolvedValue({ entries: [] })
      await loadTree('')
      refreshChangedTabs(git(1))
      getJson.mockClear()
      refreshChangedTabs(git(2))
      expect(getJson).not.toHaveBeenCalled()
    })

    it('refreshes on demand', async () => {
      getJson.mockResolvedValue({ entries: [] })
      await loadTree('')
      getJson.mockClear()
      refreshTree()
      expect(getJson).toHaveBeenCalledTimes(1)
    })
  })

  it('falls back to the project when no session is open', async () => {
    window.history.pushState(null, '', '/p/p1')
    getJson.mockResolvedValue({ entries: [] })
    await loadTree('')
    expect(getJson).toHaveBeenCalledWith('/api/projects/p1/workspace/tree?path=')
  })

  it('stays on the context tab across a session change', () => {
    selectView(CONTEXT_VIEW)
    resetWorkspace()
    expect(useWorkspace.getState().view).toBe(CONTEXT_VIEW)
  })

  it('keeps the open file when going to another view and back', async () => {
    openTab('file', 'a.ts')
    await flush()
    selectView(CONTEXT_VIEW)
    expect(useWorkspace.getState().activeKey).toBe('file:a.ts')
    selectView(null)
    expect(useWorkspace.getState().activeKey).toBe('file:a.ts')
  })

  it('shows the files view when a file is opened', async () => {
    selectView(CONTEXT_VIEW)
    openTab('file', 'a.ts')
    await flush()
    expect(useWorkspace.getState().view).toBeNull()
  })
})
