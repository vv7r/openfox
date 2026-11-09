import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
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
    app.use(express.json({ limit: '5mb' }))
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
      expect(await (await get('file', 'README.md')).json()).toMatchObject({
        path: 'README.md',
        content: 'one\n',
        editable: true,
      })
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

  describe('saving a file', () => {
    const put = (path: string, body: unknown) =>
      fetch(`${baseUrl}/api/sessions/s1/workspace/file?path=${encodeURIComponent(path)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    const hashOf = async (path: string) => ((await (await get('file', path)).json()) as { hash: string }).hash

    it('writes the file and returns the hash of what is now on disk', async () => {
      const response = await put('README.md', { content: 'two\n', baseHash: await hashOf('README.md') })
      expect(response.status).toBe(200)
      expect(await readFile(join(workdir, 'README.md'), 'utf8')).toBe('two\n')
      const { hash } = (await response.json()) as { hash: string }
      expect(hash).toBe(await hashOf('README.md'))
    })

    it('refuses a save based on a version that changed on disk', async () => {
      const baseHash = await hashOf('README.md')
      await writeFile(join(workdir, 'README.md'), 'written by the agent\n')
      expect((await put('README.md', { content: 'mine\n', baseHash })).status).toBe(409)
      expect(await readFile(join(workdir, 'README.md'), 'utf8')).toBe('written by the agent\n')
    })

    it('overwrites when no base version is given', async () => {
      await writeFile(join(workdir, 'README.md'), 'written by the agent\n')
      expect((await put('README.md', { content: 'mine\n' })).status).toBe(200)
      expect(await readFile(join(workdir, 'README.md'), 'utf8')).toBe('mine\n')
    })

    it('does not create files', async () => {
      expect((await put('new.txt', { content: 'x' })).status).toBe(404)
    })

    it('rejects a body without text content', async () => {
      expect((await put('README.md', { content: 3 })).status).toBe(400)
    })

    it('rejects content over the size limit', async () => {
      expect((await put('README.md', { content: 'x'.repeat(MAX_FILE_BYTES + 1) })).status).toBe(413)
    })

    it.each(['../outside/secret.txt', '.git/config', '.env'])('refuses %s', async (path) => {
      expect((await put(path, { content: 'x' })).status).toBe(403)
    })

    it('refuses a symlink that leaves the workspace', async () => {
      await symlink(join(outside, 'secret.txt'), join(workdir, 'link.txt'))
      expect((await put('link.txt', { content: 'x' })).status).toBe(403)
      expect(await readFile(join(outside, 'secret.txt'), 'utf8')).toBe('outside')
    })

    it('leaves binary files alone', async () => {
      await writeFile(join(workdir, 'a.bin'), Buffer.from([1, 0, 2]))
      expect((await put('a.bin', { content: 'x' })).status).toBe(415)
    })

    it('leaves files that are not UTF-8 alone, rather than corrupting them', async () => {
      await writeFile(join(workdir, 'latin.txt'), Buffer.from([0x63, 0x61, 0x66, 0xe9]))
      expect((await put('latin.txt', { content: 'x' })).status).toBe(415)
      expect((await readFile(join(workdir, 'latin.txt')))[3]).toBe(0xe9)
    })
  })
})
