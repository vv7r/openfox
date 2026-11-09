import { authFetch, getJson, sendJson } from '../../api'
import { reloadLibrary } from '../../controller'
import { useLoad } from '../../hooks'
import { t } from '../../i18n'
import { useRoute } from '../../router'
import { useApp } from '../../store/app'

export interface LibraryLists<T> {
  defaults: T[]
  userItems: T[]
  projectItems: T[]
  modelOverrides?: Record<string, string>
}

export type Destination = 'user' | 'project'

export function useProjectDir(): string | undefined {
  const { projectId } = useRoute()
  return useApp((state) => state.projects.find((project) => project.id === projectId)?.workdir)
}

/** Null when it worked, otherwise the reason to show. */
async function failure(response: Response): Promise<string | null> {
  if (response.ok) return null
  const data = (await response.json().catch(() => ({}))) as { error?: string }
  return data.error ?? t({ en: 'Action failed', fr: 'Action échouée' })
}

export function useLibrary<Info, Full>(kind: 'agents' | 'commands', workdir: string | undefined) {
  const scoped = (path: string) => `/api/${kind}${path}${workdir ? `?workdir=${encodeURIComponent(workdir)}` : ''}`
  const { data, reload } = useLoad(() => getJson<LibraryLists<Info>>(scoped('')), `${kind}:${workdir ?? ''}`)

  const changed = () => {
    reload()
    void reloadLibrary()
  }

  const finish = async (request: Promise<Response>) => {
    const error = await failure(await request)
    if (!error) changed()
    return error
  }

  return {
    data,
    reload,
    getItem: (id: string, builtIn: boolean) =>
      getJson<Full>(builtIn ? `/api/${kind}/defaults/${encodeURIComponent(id)}` : scoped(`/${encodeURIComponent(id)}`)),
    create: (item: Full, destination: Destination) => finish(sendJson(scoped(''), 'POST', { ...item, destination })),
    update: (id: string, item: Full) => finish(sendJson(scoped(`/${encodeURIComponent(id)}`), 'PUT', item)),
    remove: (id: string) => finish(authFetch(scoped(`/${encodeURIComponent(id)}`), { method: 'DELETE' })),
  }
}
