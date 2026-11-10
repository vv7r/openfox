import { lstat, realpath, rm } from 'node:fs/promises'
import { isAbsolute, relative } from 'node:path'
import { getRootDirBlockReason } from '../../shared/workspace.js'
import { serverT } from '../i18n.js'

export interface FolderDeletionGuards {
  /** Folders that must survive: neither they nor anything holding them can be deleted. */
  protectedPaths: readonly string[]
  /** Working directories of the other projects, which keep needing their files. */
  otherWorkdirs: readonly string[]
}

export type FolderDeletionBlock = 'invalid' | 'system' | 'protected' | 'other_project' | 'symlink' | 'not_directory'

export type FolderDeletionResult = { ok: true } | { ok: false; reason: FolderDeletionBlock | 'failed'; error?: string }

/** `relative` rather than a prefix test: `/srv/openfox-demo` is not inside `/srv/openfox`. */
function isSameOrInside(path: string, parent: string): boolean {
  const fromParent = relative(parent, path)
  return fromParent === '' || (fromParent !== '..' && !/^\.\.[\\/]/.test(fromParent) && !isAbsolute(fromParent))
}

/** A guard reached through a symlink protects where the link leads, too. */
async function withRealPaths(paths: readonly string[]): Promise<string[]> {
  const real = await Promise.all(paths.map((path) => realpath(path).catch(() => path)))
  return [...paths, ...real]
}

/** Why this folder must not be deleted, or null when it can be. */
export function getFolderDeletionBlock(workdir: string, guards: FolderDeletionGuards): FolderDeletionBlock | null {
  if (!isAbsolute(workdir) || workdir.split(/[\\/]/).includes('..')) return 'invalid'
  if (getRootDirBlockReason(workdir) !== null) return 'system'
  if (guards.protectedPaths.some((path) => isSameOrInside(path, workdir))) return 'protected'
  if (guards.otherWorkdirs.some((path) => isSameOrInside(path, workdir))) return 'other_project'
  return null
}

/**
 * Deletes a project's folder from the disk. Every guard runs on the path as stored and on where
 * it really leads, because a project opened through a symlinked parent can land on a guarded folder.
 */
export async function deleteProjectFolder(
  workdir: string,
  guards: FolderDeletionGuards,
): Promise<FolderDeletionResult> {
  const block = getFolderDeletionBlock(workdir, guards)
  if (block) return { ok: false, reason: block }
  try {
    const stats = await lstat(workdir)
    if (stats.isSymbolicLink()) return { ok: false, reason: 'symlink' }
    if (!stats.isDirectory()) return { ok: false, reason: 'not_directory' }
    const realBlock = getFolderDeletionBlock(await realpath(workdir), {
      protectedPaths: await withRealPaths(guards.protectedPaths),
      otherWorkdirs: await withRealPaths(guards.otherWorkdirs),
    })
    if (realBlock) return { ok: false, reason: realBlock }
    await rm(workdir, { recursive: true, force: true })
    return { ok: true }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { ok: true }
    return { ok: false, reason: 'failed', error: error instanceof Error ? error.message : String(error) }
  }
}

export function folderDeletionMessage(result: Extract<FolderDeletionResult, { ok: false }>): string {
  switch (result.reason) {
    case 'invalid':
      return serverT({ en: 'This folder path is not valid.', fr: 'Le chemin de ce dossier n’est pas valide.' })
    case 'system':
      return serverT({ en: 'A system folder cannot be deleted.', fr: 'Un dossier système ne peut pas être supprimé.' })
    case 'protected':
      return serverT({
        en: 'This folder holds your home or OpenFox’s own files, it cannot be deleted.',
        fr: 'Ce dossier contient votre dossier personnel ou les fichiers d’OpenFox, il ne peut pas être supprimé.',
      })
    case 'other_project':
      return serverT({
        en: 'Another project uses this folder, it cannot be deleted.',
        fr: 'Un autre projet utilise ce dossier, il ne peut pas être supprimé.',
      })
    case 'symlink':
      return serverT({
        en: 'This project is a symbolic link, delete its folder by hand.',
        fr: 'Ce projet est un lien symbolique, supprimez son dossier à la main.',
      })
    case 'not_directory':
      return serverT({ en: 'This path is not a folder.', fr: 'Ce chemin n’est pas un dossier.' })
    case 'failed':
      return serverT(
        { en: 'The folder could not be deleted: {{error}}', fr: 'Le dossier n’a pas pu être supprimé : {{error}}' },
        { error: result.error ?? '' },
      )
  }
}
