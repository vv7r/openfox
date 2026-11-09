import { getJson, sendJson } from '../api'
import { useLoad } from '../hooks'
import { t } from '../i18n'
import { useApp } from '../store/app'
import styles from './Panels.module.css'

interface Server {
  name: string
  status: string
  estimatedTokens?: number
  error?: string
}

export function McpPanel() {
  const sessionId = useApp((state) => state.session?.id)
  const servers = useLoad(() => getJson<{ servers: Server[] }>('/api/mcp/servers'), 'servers')
  const overrides = useLoad(
    () => getJson<{ disabledServers: string[] }>(`/api/sessions/${sessionId}/mcp/overrides`),
    sessionId ?? '',
  )
  const disabled = overrides.data?.disabledServers ?? []

  const toggle = async (name: string) => {
    const disabledServers = disabled.includes(name) ? disabled.filter((server) => server !== name) : [...disabled, name]
    await sendJson(`/api/sessions/${sessionId}/mcp/overrides`, 'PUT', { disabledServers })
    overrides.reload()
  }

  return (
    <ul className={styles.list} data-testid="mcp-list">
      {servers.data?.servers.map((server) => (
        <li key={server.name}>
          <span className={styles.dot} data-state={server.status} />
          <span className={styles.grow}>
            {server.name}
            {server.error && <span className={styles.muted}>{` · ${server.error}`}</span>}
          </span>
          {server.estimatedTokens !== undefined && <span className={styles.muted}>{`~${server.estimatedTokens}`}</span>}
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={!disabled.includes(server.name)}
              onChange={() => void toggle(server.name)}
            />
            {t({ en: 'This session', fr: 'Cette session' })}
          </label>
        </li>
      ))}
    </ul>
  )
}
