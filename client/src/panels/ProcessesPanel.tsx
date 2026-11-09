import { useEffect, useRef, useState } from 'react'
import type { BackgroundProcess, LogLine, ServerMessage } from '@shared/protocol.js'
import type { DevServerStatus } from '@shared/dev-server.js'
import { authFetch, getJson, sendJson } from '../api'
import { subscribeMessages } from '../controller'
import { useLoad } from '../hooks'
import { t } from '../i18n'
import { useApp } from '../store/app'
import styles from './Panels.module.css'

const MAX_LOG_CHARS = 64_000

function BackgroundProcesses({ sessionId }: { sessionId: string }) {
  const { data, reload } = useLoad(
    () => getJson<{ processes: BackgroundProcess[] }>(`/api/sessions/${sessionId}/background-processes`),
    sessionId,
  )
  const [logs, setLogs] = useState<Record<string, string>>({})

  useEffect(
    () =>
      subscribeMessages((message: ServerMessage) => {
        if (!message.type.startsWith('backgroundProcess.')) return
        if (message.type === 'backgroundProcess.output') {
          const { processId, content } = message.payload as { processId: string; content: string }
          setLogs((all) => ({ ...all, [processId]: ((all[processId] ?? '') + content).slice(-MAX_LOG_CHARS) }))
        } else {
          reload()
        }
      }),
    [reload],
  )

  const stop = async (id: string) => {
    await authFetch(`/api/sessions/${sessionId}/background-process/${id}/stop`, { method: 'POST' })
    reload()
  }

  const processes = data?.processes ?? []
  return (
    <section>
      <h3 className={styles.eyebrow}>{t({ en: 'Background processes', fr: 'Processus en arrière-plan' })}</h3>
      {data && processes.length === 0 && <p className={styles.muted}>{t({ en: 'None', fr: 'Aucun' })}</p>}
      <ul className={styles.list}>
        {processes.map((process) => (
          <li key={process.id} className={styles.column}>
            <div className={styles.row}>
              <span className={styles.grow}>{process.name}</span>
              <span className={styles.muted}>{process.status}</span>
              {process.status === 'running' && (
                <button type="button" onClick={() => void stop(process.id)}>
                  {t({ en: 'Stop', fr: 'Arrêter' })}
                </button>
              )}
            </div>
            <code className={styles.muted}>{process.command}</code>
            {logs[process.id] && <pre className={styles.log}>{logs[process.id]}</pre>}
          </li>
        ))}
      </ul>
    </section>
  )
}

function DevServer({ workdir }: { workdir: string }) {
  const query = `workdir=${encodeURIComponent(workdir)}`
  const status = useLoad(() => getJson<DevServerStatus>(`/api/dev-server?${query}`), workdir)
  const [logs, setLogs] = useState('')
  const [command, setCommand] = useState('')
  const [url, setUrl] = useState('')
  const seeded = useRef(false)
  const config = status.data?.config

  useEffect(() => {
    if (config && !seeded.current) {
      seeded.current = true
      setCommand(config.command)
      setUrl(config.url ?? '')
    }
  }, [config])

  useEffect(() => {
    void getJson<{ logs: LogLine[] }>(`/api/dev-server/logs?${query}`)
      .then((data) => setLogs(data.logs.map((line) => line.content).join('')))
      .catch(() => {})
    return subscribeMessages((message) => {
      if (message.type === 'devServer.state') status.reload()
      if (message.type === 'devServer.output') {
        const { content } = message.payload as { content: string }
        setLogs((all) => (all + content).slice(-MAX_LOG_CHARS))
      }
    })
    // status.reload is stable
  }, [query])

  const act = async (action: string) => {
    await authFetch(`/api/dev-server/${action}?${query}`, { method: 'POST' })
    status.reload()
  }

  const saveConfig = async () => {
    await sendJson(`/api/dev-server/config?${query}`, 'POST', { ...config, command, url })
    status.reload()
  }

  const state = status.data?.state ?? 'off'
  return (
    <section>
      <h3 className={styles.eyebrow}>{t({ en: 'Dev server', fr: 'Serveur de dev' })}</h3>
      <div className={styles.row}>
        <span className={styles.dot} data-state={state === 'running' ? 'connected' : state} />
        <span className={styles.grow}>{status.data?.url ?? state}</span>
        {config &&
          (state === 'off' || state === 'error' ? (
            <button type="button" onClick={() => void act('start')}>
              {t({ en: 'Start', fr: 'Démarrer' })}
            </button>
          ) : (
            <>
              <button type="button" onClick={() => void act('restart')}>
                {t({ en: 'Restart', fr: 'Redémarrer' })}
              </button>
              <button type="button" onClick={() => void act('stop')}>
                {t({ en: 'Stop', fr: 'Arrêter' })}
              </button>
            </>
          ))}
      </div>
      <div className={styles.row}>
        <input
          className={styles.input}
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          placeholder={t({ en: 'Command', fr: 'Commande' })}
        />
        <input
          className={styles.input}
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder={t({ en: 'URL', fr: 'URL' })}
        />
        <button type="button" disabled={!command.trim() || !url.trim()} onClick={() => void saveConfig()}>
          {t({ en: 'Save', fr: 'Enregistrer' })}
        </button>
      </div>
      {logs && <pre className={styles.log}>{logs}</pre>}
    </section>
  )
}

export function ProcessesPanel() {
  const sessionId = useApp((state) => state.session?.id)
  const workdir = useApp((state) => state.session?.workspace ?? state.session?.workdir)
  return (
    <div className={styles.stack}>
      {sessionId && <BackgroundProcesses sessionId={sessionId} />}
      {workdir && <DevServer workdir={workdir} />}
    </div>
  )
}
