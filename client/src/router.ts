import { useMemo, useSyncExternalStore, type AnchorHTMLAttributes, createElement } from 'react'

export interface Route {
  projectId: string | null
  sessionId: string | null
}

/** The pane a phone shows on arriving at a route: a project without a session lists them. */
export function mobilePaneFor(route: Route): 'agent' | 'project' {
  return route.projectId && !route.sessionId ? 'project' : 'agent'
}

/** The read-only copy of a session opens outside the shell, with no socket. */
export function readonlySessionId(path: string): string | null {
  return /^\/p\/[^/]+\/s\/([^/]+)\/readonly\/?$/.exec(path)?.[1] ?? null
}

export function parseRoute(path: string): Route {
  const match = /^\/p\/([^/]+)(?:\/s\/([^/]+))?\/?$/.exec(path)
  return { projectId: match?.[1] ?? null, sessionId: match?.[2] ?? null }
}

const listeners = new Set<() => void>()

export function subscribeRoute(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

window.addEventListener('popstate', () => listeners.forEach((listener) => listener()))

export function currentRoute(): Route {
  return parseRoute(location.pathname)
}

export function navigate(path: string): void {
  if (path === location.pathname) return
  history.pushState(null, '', path)
  listeners.forEach((listener) => listener())
}

export function usePath(): string {
  return useSyncExternalStore(subscribeRoute, () => location.pathname)
}

export function useRoute(): Route {
  const path = useSyncExternalStore(subscribeRoute, () => location.pathname)
  return useMemo(() => parseRoute(path), [path])
}

export function Link({ href, onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return createElement('a', {
    ...props,
    href,
    onClick: (event: React.MouseEvent<HTMLAnchorElement>) => {
      onClick?.(event)
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
      event.preventDefault()
      navigate(href)
    },
  })
}
