import { execFile } from 'node:child_process'
import { readdir, readFile, realpath, stat } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { Router, type Request, type Response } from 'express'
import { gitSpawnEnv } from '../git/env.js'
import { serverT } from '../i18n.js'
import { isSensitivePath } from '../tools/path-security.js'
import { isDirectoryEntry } from '../utils/fs.js'

export const MAX_FILE_BYTES = 1024 * 1024

const HIDDEN_ENTRIES = new Set(['.git', 'node_modules'])

interface Located {
  absolute: string
  relative: string
}

function isInside(root: string, target: string): boolean {
  const path = relative(root, target)
  return path === '' || (!path.startsWith(`..${sep}`) && path !== '..' && !isAbsolute(path))
}

/** The real path of `target`, or of its deepest existing ancestor plus the missing part. */
async function canonicalize(target: string): Promise<string> {
  try {
    return await realpath(target)
  } catch {
    const parent = dirname(target)
    return parent === target ? target : join(await canonicalize(parent), basename(target))
  }
}

/** Resolves a request path, or null when it must not be read through this API. */
async function locate(workdir: string, requested: string): Promise<Located | null> {
  const root = await realpath(workdir)
  const lexical = resolve(root, requested)
  if (!isInside(root, lexical)) return null
  const real = await canonicalize(lexical)
  if (!isInside(root, real)) return null

  const path = relative(root, lexical)
  if (path.split(sep).includes('.git') || isSensitivePath(lexical) || isSensitivePath(real)) return null
  return { absolute: real, relative: path.split(sep).join('/') }
}

function forbidden(res: Response): void {
  res.status(403).json({ error: serverT({ en: 'Path not allowed', fr: 'Chemin non autorisé' }) })
}

function notFound(res: Response): void {
  res.status(404).json({ error: serverT({ en: 'Not found', fr: 'Introuvable' }) })
}

type TextRead = { text: string } | { binary: true } | { tooLarge: true }

function decode(buffer: Buffer): TextRead {
  if (buffer.length > MAX_FILE_BYTES) return { tooLarge: true }
  if (buffer.includes(0)) return { binary: true }
  return { text: buffer.toString('utf8') }
}

async function readWorkingFile(absolute: string): Promise<TextRead | null> {
  try {
    const info = await stat(absolute)
    if (!info.isFile()) return null
    if (info.size > MAX_FILE_BYTES) return { tooLarge: true }
    return decode(await readFile(absolute))
  } catch {
    return null
  }
}

/** The committed version of a file; null when HEAD does not have it. */
function readHeadVersion(workdir: string, path: string): Promise<TextRead | null> {
  return new Promise((done) => {
    execFile(
      'git',
      ['show', `HEAD:./${path}`],
      { cwd: workdir, env: gitSpawnEnv(), encoding: 'buffer', maxBuffer: MAX_FILE_BYTES * 2, windowsHide: true },
      (error, stdout) => {
        if (!error) done(decode(stdout))
        else done(error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' ? { tooLarge: true } : null)
      },
    )
  })
}

/** The file named by ?path=, or null once the refusal has been sent. */
async function locateRequestedFile(req: Request, res: Response): Promise<Located | null> {
  const requested = req.query['path']
  if (typeof requested !== 'string' || !requested) {
    res.status(400).json({ error: serverT({ en: 'path is required', fr: 'path est requis' }) })
    return null
  }
  const located = await locate(res.locals['workdir'] as string, requested)
  if (!located) forbidden(res)
  return located
}

/** Read-only view of a session's workspace for the editor panes. */
export function createWorkspaceFilesRoutes(getWorkdir: (sessionId: string) => string | undefined): Router {
  const router = Router({ mergeParams: true })

  router.use((req, res, next) => {
    const workdir = getWorkdir((req.params as { id: string }).id)
    if (!workdir) {
      notFound(res)
      return
    }
    res.locals['workdir'] = workdir
    next()
  })

  router.get('/tree', async (req, res) => {
    const workdir = res.locals['workdir'] as string
    const located = await locate(workdir, typeof req.query['path'] === 'string' ? req.query['path'] : '')
    if (!located) {
      forbidden(res)
      return
    }
    try {
      const dirents = (await readdir(located.absolute, { withFileTypes: true })).filter(
        (entry) => !HIDDEN_ENTRIES.has(entry.name),
      )
      const entries = await Promise.all(
        dirents.map(async (entry) => ({
          name: entry.name,
          path: located.relative ? `${located.relative}/${entry.name}` : entry.name,
          type: (await isDirectoryEntry(located.absolute, entry)) ? ('directory' as const) : ('file' as const),
        })),
      )
      entries.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'directory' ? -1 : 1))
      res.json({ entries })
    } catch {
      notFound(res)
    }
  })

  router.get('/file', async (req, res) => {
    const located = await locateRequestedFile(req, res)
    if (!located) return
    const read = await readWorkingFile(located.absolute)
    if (!read) {
      notFound(res)
      return
    }
    res.json('text' in read ? { path: located.relative, content: read.text } : { path: located.relative, ...read })
  })

  router.get('/diff', async (req, res) => {
    const located = await locateRequestedFile(req, res)
    if (!located) return
    const workdir = res.locals['workdir'] as string
    const [head, working] = await Promise.all([
      readHeadVersion(workdir, located.relative),
      readWorkingFile(located.absolute),
    ])
    if (!head && !working) {
      notFound(res)
      return
    }
    for (const side of [head, working]) {
      if (side && !('text' in side)) {
        res.json({ path: located.relative, ...side })
        return
      }
    }
    res.json({
      path: located.relative,
      original: head && 'text' in head ? head.text : '',
      modified: working && 'text' in working ? working.text : '',
    })
  })

  return router
}
