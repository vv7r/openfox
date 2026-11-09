import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getGitDiffFiles, formatGitDiffFiles, getGitBranch } from './diff.js'
import { setPluginVcsProviders, clearPluginVcsProviders } from '../plugins/vcs-providers.js'
import type { PluginVcsProvider } from '../../plugin/index.js'

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}))

vi.mock('./env.js', () => ({
  gitSpawnEnv: () => ({}),
}))

import { spawn } from 'node:child_process'

type MockProc = {
  stdout: { on: (event: string, cb: (d: Buffer) => void) => void }
  stderr: { on: (event: string, cb: (d: Buffer) => void) => void }
  on: (event: string, cb: (...args: unknown[]) => void) => void
}

function makeMockProc(stdout: string, exitCode = 0): MockProc {
  return {
    stdout: {
      on: (event, cb) => {
        if (event === 'data') setTimeout(() => cb(Buffer.from(stdout)), 0)
      },
    },
    stderr: {
      on: () => {},
    },
    on: (event, cb) => {
      if (event === 'close') setTimeout(() => cb(exitCode), 0)
    },
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  clearPluginVcsProviders()
})

describe('getGitDiffFiles', () => {
  it('passes --ignore-submodules=none to every git invocation', async () => {
    vi.mocked(spawn).mockReturnValue(makeMockProc('') as unknown as ReturnType<typeof spawn>)
    await getGitDiffFiles('/tmp/project')

    const calls = vi.mocked(spawn).mock.calls
    expect(calls.length).toBe(3)
    for (const call of calls) {
      const args = call[1] as string[]
      expect(args).toContain('--ignore-submodules=none')
    }
  })

  it('reports a modified submodule from git diff --name-status output', async () => {
    vi.mocked(spawn).mockImplementation(((_cmd: string, args: string[]) => {
      const stdout = args[0] === 'diff' ? 'M\tlibs/mod\n' : '?? untracked.txt\n'
      return makeMockProc(stdout) as unknown as ReturnType<typeof spawn>
    }) as typeof spawn)

    const files = await getGitDiffFiles('/tmp/project')

    expect(files).toContainEqual({ path: 'libs/mod', status: 'modified', additions: 0, deletions: 0 })
    expect(files).toContainEqual({ path: 'untracked.txt', status: 'added', additions: 0, deletions: 0 })
  })

  it('fills line counts from git diff --numstat, leaving binary files at zero', async () => {
    vi.mocked(spawn).mockImplementation(((_cmd: string, args: string[]) => {
      const numstat = '26\t9\tsrc/a.ts\n-\t-\timg.png\n'
      const stdout = args.includes('--numstat') ? numstat : args[0] === 'diff' ? 'M\tsrc/a.ts\nM\timg.png\n' : ''
      return makeMockProc(stdout) as unknown as ReturnType<typeof spawn>
    }) as typeof spawn)

    expect(await getGitDiffFiles('/tmp/project')).toEqual([
      { path: 'src/a.ts', status: 'modified', additions: 26, deletions: 9 },
      { path: 'img.png', status: 'modified', additions: 0, deletions: 0 },
    ])
  })

  it('delegates to plugin VCS provider when matched', async () => {
    const mockProvider: PluginVcsProvider = {
      id: 'custom-vcs',
      detect: (ctx) => ctx.workdir === '/tmp/multi-project',
      getDiffFiles: async () => [
        { path: 'repo1/file.ts', status: 'modified' },
        { path: 'repo2/other.ts', status: 'added' },
      ],
    }

    setPluginVcsProviders([{ pluginId: 'test-plugin', provider: mockProvider }])

    const files = await getGitDiffFiles('/tmp/multi-project')
    expect(files).toEqual([
      { path: 'repo1/file.ts', status: 'modified', additions: 0, deletions: 0 },
      { path: 'repo2/other.ts', status: 'added', additions: 0, deletions: 0 },
    ])
    expect(vi.mocked(spawn)).not.toHaveBeenCalled()
  })

  it('formats git diff files through VCS provider when matched', async () => {
    const mockProvider: PluginVcsProvider = {
      id: 'custom-vcs',
      detect: () => true,
      getDiffFiles: async () => [{ path: 'pkg/sub.ts', status: 'modified' }],
      formatModifiedFiles: (files) => `Files: ${files.map((f) => f.path).join(', ')}`,
    }

    setPluginVcsProviders([{ pluginId: 'test-plugin', provider: mockProvider }])

    const formatted = await formatGitDiffFiles('/tmp/custom')
    expect(formatted).toBe('Files: pkg/sub.ts')
  })

  it('resolves git branch through VCS provider when matched', async () => {
    const mockProvider: PluginVcsProvider = {
      id: 'custom-vcs',
      detect: () => true,
      getDiffFiles: async () => [],
      getBranch: async () => 'multi (main)',
    }

    setPluginVcsProviders([{ pluginId: 'test-plugin', provider: mockProvider }])

    const branch = await getGitBranch('/tmp/custom')
    expect(branch).toBe('multi (main)')
    expect(vi.mocked(spawn)).not.toHaveBeenCalled()
  })

  it('falls back to native git branch when no VCS provider matches', async () => {
    vi.mocked(spawn).mockReturnValue(makeMockProc('feature-x\n') as unknown as ReturnType<typeof spawn>)

    const branch = await getGitBranch('/tmp/native-repo')
    expect(branch).toBe('feature-x')
    expect(vi.mocked(spawn)).toHaveBeenCalled()
  })
})
