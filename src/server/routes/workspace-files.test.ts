import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import express from 'express'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createWorkspaceFilesRoutes, MAX_FILE_BYTES } from './workspace-files.js'

interface TreeBody {
  entries: Array<{ name: string; path: string; type: 'file' | 'directory' }>
}

describe('workspace files routes', () => {
  let root: string
  let workdir: string
  let outside: string
  let baseUrl: string
  let server: ReturnType<express.Express['listen']>

  const git = (...args: string[]) => execFileSync('git', args, { cwd: workdir, stdio: 'ignore' })
  const get = (route: string, path?: string, session = 's1') =>
    fetch(
      `${baseUrl}/api/sessions/${session}/workspace/${route}${path === undefined ? '' : `?path=${encodeURIComponent(path)}`}`,
    )

  beforeEach(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'openfox-workspace-')))
    workdir = join(root, 'project')
    outside = join(root, 'outside')
    await mkdir(join(workdir, 'src'), { recursive: true })
    await mkdir(join(workdir, 'node_modules', 'x'), { recursive: true })
    await mkdir(outside)
    await writeFile(join(outside, 'secret.txt'), 'outside')
    await writeFile(join(workdir, 'README.md'), 'one\n')
    await writeFile(join(workdir, 'src', 'a.ts'), 'old\n')
    git('init', '-q')
    git('-c', 'user.email=t@t', '-c', 'user.name=t', 'add', 'README.md', 'src')
    git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init')

    const app = express()
    app.use(
      '/api/sessions/:id/workspace',
      createWorkspaceFilesRoutes((id) => (id === 's1' ? workdir : undefined)),
    )
    await new Promise<void>((done) => {
      server = app.listen(0, () => {
        baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`
        done()
      })
    })
  })

  afterEach(async () => {
    server.close()
    await rm(root, { recursive: true, force: true })
  })

  it('answers 404 for an unknown session', async () => {
    expect((await get('tree', undefined, 'nope')).status).toBe(404)
  })

  describe('tree', () => {
    it('lists one level, directories first, without .git or node_modules', async () => {
      const body = (await (await get('tree')).json()) as TreeBody
      expect(body.entries).toEqual([
        { name: 'src', path: 'src', type: 'directory' },
        { name: 'README.md', path: 'README.md', type: 'file' },
      ])
    })

    it('lists a subdirectory with workspace-relative paths', async () => {
      const body = (await (await get('tree', 'src')).json()) as TreeBody
      expect(body.entries).toEqual([{ name: 'a.ts', path: 'src/a.ts', type: 'file' }])
    })

    it('refuses to leave the workspace', async () => {
      expect((await get('tree', '..')).status).toBe(403)
      expect((await get('tree', outside)).status).toBe(403)
    })
  })

  describe('file', () => {
    it('returns the content', async () => {
      expect(await (await get('file', 'README.md')).json()).toEqual({ path: 'README.md', content: 'one\n' })
    })

    it.each(['../outside/secret.txt', 'src/../../outside/secret.txt'])('refuses the traversal %s', async (path) => {
      expect((await get('file', path)).status).toBe(403)
    })

    it('refuses an absolute path outside the workspace', async () => {
      expect((await get('file', join(outside, 'secret.txt'))).status).toBe(403)
    })

    it('refuses a symlink that points outside', async () => {
      await symlink(join(outside, 'secret.txt'), join(workdir, 'link.txt'))
      expect((await get('file', 'link.txt')).status).toBe(403)
    })

    it('refuses a sibling directory sharing the workspace prefix', async () => {
      await mkdir(`${workdir}-other`)
      await writeFile(`${workdir}-other/x.txt`, 'x')
      expect((await get('file', '../project-other/x.txt')).status).toBe(403)
    })

    it('refuses files inside .git', async () => {
      expect((await get('file', '.git/config')).status).toBe(403)
    })

    it('refuses sensitive files', async () => {
      await writeFile(join(workdir, '.env'), 'TOKEN=1')
      expect((await get('file', '.env')).status).toBe(403)
    })

    it('flags binary content instead of returning it', async () => {
      await writeFile(join(workdir, 'b.bin'), Buffer.from([1, 0, 2]))
      expect(await (await get('file', 'b.bin')).json()).toEqual({ path: 'b.bin', binary: true })
    })

    it('flags a file over the size limit instead of returning it', async () => {
      await writeFile(join(workdir, 'big.txt'), 'x'.repeat(MAX_FILE_BYTES + 1))
      expect(await (await get('file', 'big.txt')).json()).toEqual({ path: 'big.txt', tooLarge: true })
    })

    it('answers 404 for a missing file and 400 without a path', async () => {
      expect((await get('file', 'nope.txt')).status).toBe(404)
      expect((await get('file')).status).toBe(400)
    })
  })

  describe('diff', () => {
    it('returns both sides of a modified file', async () => {
      await writeFile(join(workdir, 'src', 'a.ts'), 'new\n')
      expect(await (await get('diff', 'src/a.ts')).json()).toEqual({
        path: 'src/a.ts',
        original: 'old\n',
        modified: 'new\n',
      })
    })

    it('has an empty original for an untracked file', async () => {
      await writeFile(join(workdir, 'new.ts'), 'added\n')
      expect(await (await get('diff', 'new.ts')).json()).toEqual({ path: 'new.ts', original: '', modified: 'added\n' })
    })

    it('has an empty modified side for a deleted file', async () => {
      await rm(join(workdir, 'src', 'a.ts'))
      expect(await (await get('diff', 'src/a.ts')).json()).toEqual({
        path: 'src/a.ts',
        original: 'old\n',
        modified: '',
      })
    })

    it('applies the same path rules as file', async () => {
      await writeFile(join(workdir, '.env'), 'TOKEN=1')
      expect((await get('diff', '../outside/secret.txt')).status).toBe(403)
      expect((await get('diff', '.env')).status).toBe(403)
    })

    it('works outside a git repository, with an empty original', async () => {
      await rm(join(workdir, '.git'), { recursive: true })
      expect(await (await get('diff', 'README.md')).json()).toEqual({
        path: 'README.md',
        original: '',
        modified: 'one\n',
      })
    })
  })
})
