import type { DevServerState } from '@shared/dev-server.js'

export type RailTone = 'success' | 'warning' | 'error'

export function hasActiveMcp(servers: Array<{ name: string; status: string }>, disabledForSession: string[]): boolean {
  return servers.some((server) => server.status === 'connected' && !disabledForSession.includes(server.name))
}

export function devServerTone(state: DevServerState): RailTone | undefined {
  return state === 'off' ? undefined : state === 'running' ? 'success' : state
}
