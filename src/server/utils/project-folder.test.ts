import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deleteProjectFolder, getFolderDeletionBlock } from './project-folder.js'

const guards = { protectedPaths: ['/home/me', '/home/me/.config/openfox', '/srv/openfox'], otherWorkdirs: [] }

describe('getFolderDeletionBlock', () => {
  it('allows an ordinary project folder', () => {
    expect(getFolderDeletionBlock('/home/me/projects/demo', guards)).toBeNull()
  })

  it('ignores trailing slashes', () => {
    expect(getFolderDeletionBlock('/home/me/', guards)).toBe('protected')
    expect(getFolderDeletionBlock('/home/me/projects/demo/', guards)).toBeNull()
  })

  it.each(['/', '/etc', '/usr', '/home', '/opt', '/tmp'])('refuses the system path %s', (path) => {
    expect(getFolderDeletionBlock(path, guards)).toBe('system')
  })

  it('refuses anything inside a virtual filesystem', () => {
    expect(getFolderDeletionBlock('/proc/1/cwd', guards)).toBe('system')
  })

  it('refuses a relative or dotted path', () => {
    expect(getFolderDeletionBlock('projects/demo', guards)).toBe('invalid')
    expect(getFolderDeletionBlock('/home/me/projects/../..', guards)).toBe('invalid')
  })

  it('refuses a protected folder and every folder holding one', () => {
    expect(getFolderDeletionBlock('/home/me', guards)).toBe('protected')
    expect(getFolderDeletionBlock('/srv/openfox', guards)).toBe('protected')
    expect(getFolderDeletionBlock('/srv', guards)).toBe('protected')
  })

  it('allows a folder that merely shares a name prefix with a protected one', () => {
    expect(getFolderDeletionBlock('/srv/openfox-demo', guards)).toBeNull()
  })

  it('refuses a folder used by, or holding, another project', () => {
    const otherWorkdirs = ['/home/me/projects/demo/sub', '/home/me/projects/twin']
    expect(getFolderDeletionBlock('/home/me/projects/demo', { ...guards, otherWorkdirs })).toBe('other_project')
    expect(getFolderDeletionBlock('/home/me/projects/twin', { ...guards, otherWorkdirs })).toBe('other_project')
    expect(getFolderDeletionBlock('/home/me/projects/alone', { ...guards, otherWorkdirs })).toBeNull()
  })
})

describe('deleteProjectFolder', () => {
  let base: string
  const noGuards = { protectedPaths: [], otherWorkdirs: [] }

  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), 'openfox-project-folder-'))
  })

  afterEach(async () => {
    await rm(base, { recursive: true, force: true })
  })

  it('removes the folder and its contents', async () => {
    const folder = join(base, 'demo')
    await mkdir(join(folder, 'src'), { recursive: true })
    await writeFile(join(folder, 'src', 'a.txt'), 'a')
    await expect(deleteProjectFolder(folder, noGuards)).resolves.toEqual({ ok: true })
    expect(existsSync(folder)).toBe(false)
  })

  it('treats a folder already gone as done', async () => {
    await expect(deleteProjectFolder(join(base, 'missing'), noGuards)).resolves.toEqual({ ok: true })
  })

  it('leaves a guarded folder untouched', async () => {
    const folder = join(base, 'demo')
    await mkdir(folder)
    await expect(deleteProjectFolder(folder, { ...noGuards, protectedPaths: [folder] })).resolves.toEqual({
      ok: false,
      reason: 'protected',
    })
    expect(existsSync(folder)).toBe(true)
  })

  it('refuses a symbolic link and leaves its target untouched', async () => {
    const target = join(base, 'target')
    await mkdir(target)
    await writeFile(join(target, 'keep.txt'), 'keep')
    const link = join(base, 'link')
    await symlink(target, link)
    await expect(deleteProjectFolder(link, noGuards)).resolves.toEqual({ ok: false, reason: 'symlink' })
    expect(existsSync(join(target, 'keep.txt'))).toBe(true)
  })

  it('refuses a path that is a file', async () => {
    const file = join(base, 'file.txt')
    await writeFile(file, 'x')
    await expect(deleteProjectFolder(file, noGuards)).resolves.toEqual({ ok: false, reason: 'not_directory' })
    expect(existsSync(file)).toBe(true)
  })

  it('refuses a folder holding a protected path reached through a link', async () => {
    const folder = join(base, 'dotfiles')
    await mkdir(join(folder, 'openfox'), { recursive: true })
    await writeFile(join(folder, 'openfox', 'config.json'), '{}')
    const link = join(base, 'config-link')
    await symlink(join(folder, 'openfox'), link)
    await expect(deleteProjectFolder(folder, { ...noGuards, protectedPaths: [link] })).resolves.toEqual({
      ok: false,
      reason: 'protected',
    })
    expect(existsSync(join(folder, 'openfox', 'config.json'))).toBe(true)
  })

  it('refuses a folder holding another project reached through a link', async () => {
    const folder = join(base, 'work')
    await mkdir(join(folder, 'app'), { recursive: true })
    const link = join(base, 'app-link')
    await symlink(join(folder, 'app'), link)
    await expect(deleteProjectFolder(folder, { ...noGuards, otherWorkdirs: [link] })).resolves.toEqual({
      ok: false,
      reason: 'other_project',
    })
    expect(existsSync(join(folder, 'app'))).toBe(true)
  })

  it('refuses a folder whose real location holds a protected path', async () => {
    const real = join(base, 'real')
    await mkdir(join(real, 'data'), { recursive: true })
    const linkedParent = join(base, 'alias')
    await symlink(real, linkedParent)
    await expect(
      deleteProjectFolder(join(linkedParent, 'data'), { ...noGuards, protectedPaths: [join(real, 'data')] }),
    ).resolves.toEqual({ ok: false, reason: 'protected' })
    expect(existsSync(join(real, 'data'))).toBe(true)
  })
})
