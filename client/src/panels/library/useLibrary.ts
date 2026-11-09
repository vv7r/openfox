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

export function useLibrary<Info, Full>(kind: 'agents' | 'commands' | 'workflows', workdir: string | undefined) {
  const scoped = (path: string, scope?: string) => {
    const query = new URLSearchParams({ ...(workdir ? { workdir } : {}), ...(scope ? { scope } : {}) }).toString()
    return `/api/${kind}${path}${query ? `?${query}` : ''}`
  }
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
    getItem: (id: string, builtIn: boolean, scope?: string) =>
      getJson<Full>(scoped(`${builtIn ? '/defaults' : ''}/${encodeURIComponent(id)}`, builtIn ? undefined : scope)),
    create: (item: Full, destination: Destination) => finish(sendJson(scoped(''), 'POST', { ...item, destination })),
    update: (id: string, item: Full, scope?: string) =>
      finish(sendJson(scoped(`/${encodeURIComponent(id)}`, scope), 'PUT', item)),
    remove: (id: string, scope?: string) =>
      finish(authFetch(scoped(`/${encodeURIComponent(id)}`, scope), { method: 'DELETE' })),
  }
}
