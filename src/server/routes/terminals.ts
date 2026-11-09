import { Router } from 'express'
import { terminalManager, type TerminalSize } from '../terminal/manager.js'
import { serverT } from '../i18n.js'

export interface TerminalSessionResponse {
  id: string
  workdir: string
  projectId: string
}

const MAX_DIMENSION = 1000

const isDimension = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= MAX_DIMENSION

/** The size to start the shell at: nothing usable means the default one. */
export function terminalSize(body: unknown): TerminalSize | undefined {
  const { cols, rows } = (body ?? {}) as { cols?: unknown; rows?: unknown }
  return isDimension(cols) && isDimension(rows) ? { cols, rows } : undefined
}

export function createTerminalRoutes(): Router {
  const router = Router()

  router.get('/', (req, res) => {
    const projectId = req.query['projectId'] as string | undefined
    const sessions = projectId ? terminalManager.getByProject(projectId) : []
    const response: TerminalSessionResponse[] = sessions.map((s) => ({
      id: s.id,
      workdir: s.workdir,
      projectId: s.projectId,
    }))
    res.json(response)
  })

  router.post('/', (req, res) => {
    const workdir = req.body?.workdir as string | undefined
    const projectId = req.body?.projectId as string | undefined
    const session = terminalManager.create(workdir, projectId, terminalSize(req.body))
    res.status(201).json({ id: session.id, workdir: session.workdir, projectId: session.projectId })
  })

  router.delete('/:id', (req, res) => {
    const { id } = req.params
    const success = terminalManager.kill(id)
    if (success) {
      res.status(204).send()
    } else {
      res.status(404).json({ error: serverT({ en: 'Terminal not found', fr: 'Terminal introuvable' }) })
    }
  })

  router.get('/:id', (req, res) => {
    const { id } = req.params
    const session = terminalManager.get(id)
    if (session) {
      res.json({ id: session.id, workdir: session.workdir })
    } else {
      res.status(404).json({ error: serverT({ en: 'Terminal not found', fr: 'Terminal introuvable' }) })
    }
  })

  return router
}
