import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, Plus } from 'lucide-react'
import { authFetch, getJson, sendJson } from '../api'
import { useLoad, useServerEvents } from '../hooks'
import { t } from '../i18n'
import { hasActiveMcp } from '../shell/railStatus'
import { useApp } from '../store/app'
import { emptyMcpForm, mcpBody, mcpFormFrom, validateMcpForm, type McpForm, type McpServer } from './mcp/mcpForm'
import libraryStyles from './library/Library.module.css'
import styles from './Panels.module.css'

const LONG_DESCRIPTION = 80

const compact = (tokens: number) => (tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : String(tokens))

async function reasonOf(response: Response): Promise<string> {
  const data = (await response.json().catch(() => ({}))) as { error?: string }
  return data.error ?? t({ en: 'Request failed', fr: 'Échec de la requête' })
}

function Fields({ form, onChange }: { form: McpForm; onChange: (form: McpForm) => void }) {
  const text = (key: 'command' | 'args' | 'url' | 'timeout') => ({
    className: styles.input,
    value: form[key],
    onChange: (event: { target: { value: string } }) => onChange({ ...form, [key]: event.target.value }),
  })
  const area = (key: 'env' | 'headers') => ({
    className: `${styles.input} ${libraryStyles.mono}`,
    rows: 3,
    value: form[key],
    onChange: (event: { target: { value: string } }) => onChange({ ...form, [key]: event.target.value }),
  })
  const keyValueHint = t({ en: 'KEY=VALUE, one per line', fr: 'KEY=VALEUR, une par ligne' })
  return (
    <>
      <div className={libraryStyles.chips} role="group" aria-label={t({ en: 'Transport', fr: 'Transport' })}>
        <button
          type="button"
          className={libraryStyles.chip}
          aria-pressed={form.transport === 'stdio'}
          onClick={() => onChange({ ...form, transport: 'stdio' })}
        >
          {t({ en: 'Local command (stdio)', fr: 'Commande locale (stdio)' })}
        </button>
        <button
          type="button"
          className={libraryStyles.chip}
          data-testid="mcp-transport-http"
          aria-pressed={form.transport === 'http'}
          onClick={() => onChange({ ...form, transport: 'http' })}
        >
          {t({ en: 'Remote (HTTP)', fr: 'Distant (HTTP)' })}
        </button>
      </div>
      {form.transport === 'stdio' ? (
        <>
          <label className={styles.field}>
            {t({ en: 'Command', fr: 'Commande' })}
            <input {...text('command')} data-testid="mcp-command" />
          </label>
          <label className={styles.field}>
            {t({ en: 'Arguments (space-separated)', fr: 'Arguments (séparés par des espaces)' })}
            <input {...text('args')} />
          </label>
          <label className={styles.field}>
            {`${t({ en: 'Environment variables', fr: 'Variables d’environnement' })} (${keyValueHint})`}
            <textarea {...area('env')} />
          </label>
        </>
      ) : (
        <>
          <label className={styles.field}>
            {t({ en: 'URL', fr: 'URL' })}
            <input {...text('url')} data-testid="mcp-url" />
          </label>
          <label className={styles.field}>
            {`${t({ en: 'Headers', fr: 'En-têtes' })} (${keyValueHint})`}
            <textarea {...area('headers')} />
          </label>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={form.oauth}
              onChange={(event) => onChange({ ...form, oauth: event.target.checked })}
            />
            <span>
              {t({ en: 'Authorize with OAuth', fr: 'Autoriser avec OAuth' })}
              <div className={styles.muted}>
                {t({
                  en: 'For servers that require a sign in rather than a static credential. Expand the server afterwards to authorize.',
                  fr: 'Pour les serveurs qui exigent une connexion plutôt qu’un identifiant statique. Développez ensuite le serveur pour autoriser.',
                })}
              </div>
            </span>
          </label>
        </>
      )}
      <label className={styles.field}>
        {t({ en: 'Timeout in seconds (optional)', fr: 'Délai d’expiration en secondes (facultatif)' })}
        <input {...text('timeout')} inputMode="decimal" />
      </label>
    </>
  )
}

function ServerForm({
  editing,
  initial,
  onDone,
  onCancel,
}: {
  editing: string | null
  initial: McpForm
  onDone: () => void
  onCancel: () => void
}) {
  const [form, setForm] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    const invalid = validateMcpForm(form, editing === null)
    if (invalid) {
      setError(t(invalid))
      return
    }
    setSaving(true)
    setError(null)
    const response = await sendJson(
      editing === null ? '/api/mcp/servers' : `/api/mcp/servers/${encodeURIComponent(editing)}`,
      editing === null ? 'POST' : 'PUT',
      mcpBody(form, editing === null),
    )
    setSaving(false)
    if (response.ok) onDone()
    else setError(await reasonOf(response))
  }

  return (
    <div className={styles.stack} data-testid="mcp-form">
      <h3 className={styles.eyebrow}>
        {editing === null
          ? t({ en: 'Add an MCP server', fr: 'Ajouter un serveur MCP' })
          : t({ en: 'Edit {{name}}', fr: 'Modifier {{name}}' }, { name: editing })}
      </h3>
      {editing === null && (
        <label className={styles.field}>
          {t({ en: 'Name', fr: 'Nom' })}
          <input
            className={styles.input}
            data-testid="mcp-name"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </label>
      )}
      <Fields form={form} onChange={setForm} />
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.row}>
        <span className={styles.grow} />
        <button type="button" onClick={onCancel}>
          {t({ en: 'Cancel', fr: 'Annuler' })}
        </button>
        <button
          type="button"
          className={styles.primary}
          disabled={saving}
          data-testid="mcp-save"
          onClick={() => void save()}
        >
          {editing === null ? t({ en: 'Add', fr: 'Ajouter' }) : t({ en: 'Save', fr: 'Enregistrer' })}
        </button>
      </div>
    </div>
  )
}

function OAuth({ name, onChanged }: { name: string; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)
  const [redirectUri, setRedirectUri] = useState('')
  const [pasted, setPasted] = useState('')
  const [error, setError] = useState<string | null>(null)
  const endpoint = `/api/mcp/servers/${encodeURIComponent(name)}/oauth`

  useEffect(() => {
    const channel = new BroadcastChannel('openfox-oauth')
    channel.onmessage = (event: MessageEvent<{ type?: string }>) => {
      if (event.data.type === 'oauth-callback-complete') setRedirectUri('')
    }
    return () => channel.close()
  }, [])

  const run = async (request: () => Promise<Response>, onOk: (data: Record<string, string>) => void) => {
    setBusy(true)
    setError(null)
    const response = await request()
    if (response.ok) onOk((await response.json().catch(() => ({}))) as Record<string, string>)
    else setError(await reasonOf(response))
    setBusy(false)
  }

  const start = () =>
    run(
      () => sendJson(`${endpoint}/start`, 'POST', {}),
      (data) => {
        if (data['status'] !== 'redirect') {
          onChanged()
          return
        }
        setRedirectUri(data['redirectUri'] ?? '')
        window.open(data['authorizationUrl'], '_blank', 'noopener,noreferrer')
      },
    )

  const complete = () =>
    run(
      () => sendJson(`${endpoint}/complete`, 'POST', { response: pasted }),
      () => {
        setPasted('')
        setRedirectUri('')
        onChanged()
      },
    )

  const forget = () => run(() => authFetch(endpoint, { method: 'DELETE' }), onChanged)

  return (
    <div className={styles.form}>
      <div className={styles.row}>
        <button type="button" disabled={busy} onClick={() => void start()}>
          {t({ en: 'Authorize', fr: 'Autoriser' })}
        </button>
        <button type="button" disabled={busy} onClick={() => void forget()}>
          {t({ en: 'Forget credentials', fr: 'Oublier les identifiants' })}
        </button>
      </div>
      {redirectUri && (
        <>
          <p className={styles.muted}>
            {t({
              en: 'A tab opened for you to sign in. If it ends up on a page that will not load, copy the whole address from it and paste it below.',
              fr: 'Un onglet s’est ouvert pour vous connecter. S’il aboutit sur une page qui ne charge pas, copiez l’adresse complète et collez-la ci-dessous.',
            })}
          </p>
          <code className={styles.muted}>{redirectUri}</code>
          <div className={styles.row}>
            <input
              className={styles.input}
              value={pasted}
              onChange={(event) => setPasted(event.target.value)}
              placeholder={t({ en: 'Paste the callback URL', fr: 'Collez l’URL de rappel' })}
            />
            <button type="button" disabled={busy || !pasted} onClick={() => void complete()}>
              {t({ en: 'Finish', fr: 'Terminer' })}
            </button>
          </div>
        </>
      )}
      {error && <p className={styles.error}>{error}</p>}
    </div>
  )
}

function ToolRow({ tool, onToggle }: { tool: McpServer['tools'][number]; onToggle: () => Promise<void> }) {
  const [pending, setPending] = useState<boolean | null>(null)
  const [open, setOpen] = useState(false)
  const long = (tool.description?.length ?? 0) > LONG_DESCRIPTION
  return (
    <div className={styles.toggle}>
      <input
        type="checkbox"
        checked={pending ?? tool.enabled}
        aria-label={tool.name}
        onChange={() => {
          setPending(!tool.enabled)
          void onToggle().finally(() => setPending(null))
        }}
      />
      <span className={styles.grow}>
        <code>{tool.name}</code>
        <span className={styles.muted}>{` ~${compact(tool.estimatedTokens)}`}</span>
        {tool.description && (
          <div className={styles.muted}>
            {long && !open ? `${tool.description.slice(0, LONG_DESCRIPTION)}…` : tool.description}
            {long && (
              <button type="button" className={styles.link} onClick={() => setOpen(!open)}>
                {open ? t({ en: ' Less', fr: ' Moins' }) : t({ en: ' More', fr: ' Plus' })}
              </button>
            )}
          </div>
        )}
      </span>
    </div>
  )
}

function ServerCard({
  server,
  session,
  sessionEnabled,
  onSessionToggle,
  onEdit,
  onChanged,
  onError,
}: {
  server: McpServer
  session: boolean
  sessionEnabled: boolean
  onSessionToggle: () => void
  onEdit: () => void
  onChanged: () => void
  onError: (error: string | null) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [confirming, setConfirming] = useState(false)
  // A server can take seconds to reconnect: the checkbox answers at once
  const [pendingDisabled, setPendingDisabled] = useState<boolean | null>(null)
  const disabled = pendingDisabled ?? server.config.disabled === true
  const url = `/api/mcp/servers/${encodeURIComponent(server.name)}`
  const Chevron = expanded ? ChevronDown : ChevronRight

  const act = async (request: Promise<Response>) => {
    const response = await request
    onError(response.ok ? null : await reasonOf(response))
    onChanged()
  }

  return (
    <li className={styles.column} data-testid={`mcp-server-${server.name}`}>
      <div className={styles.row}>
        <span className={styles.dot} data-state={server.status} />
        <button
          type="button"
          className={styles.link}
          aria-expanded={expanded}
          aria-label={server.name}
          onClick={() => setExpanded(!expanded)}
        >
          <Chevron size={13} />
        </button>
        <span className={styles.grow}>
          {server.name}
          <span className={styles.muted}>
            {` · ${server.config.transport ?? 'stdio'} · ${t(
              { en: '{{count}} tools', fr: '{{count}} outils' },
              { count: server.tools.length },
            )} · ~${compact(server.estimatedTokens)}`}
          </span>
          {server.status === 'error' && server.error && <div className={styles.error}>{server.error}</div>}
        </span>
        {session && (
          <label className={styles.check}>
            <input type="checkbox" checked={sessionEnabled} onChange={onSessionToggle} />
            {t({ en: 'This session', fr: 'Cette session' })}
          </label>
        )}
        <label className={styles.check}>
          <input
            type="checkbox"
            data-testid="mcp-enabled"
            checked={!disabled}
            onChange={() => {
              setPendingDisabled(!disabled)
              void act(sendJson(url, 'PUT', { disabled: !disabled })).finally(() => setPendingDisabled(null))
            }}
          />
          {t({ en: 'Enabled', fr: 'Activé' })}
        </label>
      </div>
      {expanded && (
        <div className={styles.form}>
          <code className={styles.muted}>
            {server.config.url ?? `${server.config.command ?? ''} ${server.config.args?.join(' ') ?? ''}`}
          </code>
          <div className={styles.row}>
            <button type="button" data-testid="mcp-edit" onClick={onEdit}>
              {t({ en: 'Edit', fr: 'Modifier' })}
            </button>
            {confirming ? (
              <>
                <button
                  type="button"
                  className={libraryStyles.danger}
                  data-testid="mcp-delete-confirm"
                  onClick={() => void act(authFetch(url, { method: 'DELETE' }))}
                >
                  {t({ en: 'Confirm', fr: 'Confirmer' })}
                </button>
                <button type="button" onClick={() => setConfirming(false)}>
                  {t({ en: 'Cancel', fr: 'Annuler' })}
                </button>
              </>
            ) : (
              <button type="button" data-testid="mcp-delete" onClick={() => setConfirming(true)}>
                {t({ en: 'Remove', fr: 'Supprimer' })}
              </button>
            )}
          </div>
          {server.config.oauth && <OAuth name={server.name} onChanged={onChanged} />}
          {server.tools.length === 0 && (
            <p className={styles.muted}>{t({ en: 'No tools available', fr: 'Aucun outil disponible' })}</p>
          )}
          {server.tools.map((tool) => (
            <ToolRow
              key={tool.name}
              tool={tool}
              onToggle={() =>
                act(sendJson(`${url}/tools/${encodeURIComponent(tool.name)}`, 'PUT', { enabled: !tool.enabled }))
              }
            />
          ))}
        </div>
      )}
    </li>
  )
}

type FormState = { editing: string | null; initial: McpForm } | null

export function McpPanel() {
  const sessionId = useApp((state) => state.session?.id)
  const servers = useLoad(() => getJson<{ servers: McpServer[] }>('/api/mcp/servers'), 'servers')
  const overrides = useLoad(
    () =>
      sessionId
        ? getJson<{ disabledServers: string[] }>(`/api/sessions/${sessionId}/mcp/overrides`)
        : Promise.resolve({ disabledServers: [] }),
    sessionId ?? '',
  )
  const [form, setForm] = useState<FormState>(null)
  const [error, setError] = useState<string | null>(null)
  useServerEvents(['mcp.servers.changed'], useCallback(servers.reload, [servers.reload]))
  const disabled = overrides.data?.disabledServers ?? []

  // The rail's indicator follows what is changed here
  const loadedServers = servers.data?.servers
  const loadedOverrides = overrides.data?.disabledServers
  useEffect(() => {
    if (sessionId && loadedServers && loadedOverrides)
      useApp.setState({ mcpActive: hasActiveMcp(loadedServers, loadedOverrides) })
  }, [sessionId, loadedServers, loadedOverrides])

  const toggleForSession = async (name: string) => {
    const disabledServers = disabled.includes(name) ? disabled.filter((server) => server !== name) : [...disabled, name]
    await sendJson(`/api/sessions/${sessionId}/mcp/overrides`, 'PUT', { disabledServers })
    overrides.reload()
  }

  if (form) {
    return (
      <ServerForm
        editing={form.editing}
        initial={form.initial}
        onCancel={() => setForm(null)}
        onDone={() => {
          setForm(null)
          servers.reload()
        }}
      />
    )
  }

  return (
    <div className={styles.stack}>
      <div className={styles.row}>
        <span className={`${styles.muted} ${styles.grow}`}>
          {t({
            en: 'MCP servers provide external tools that extend what agents can do.',
            fr: 'Les serveurs MCP fournissent des outils externes qui étendent les capacités des agents.',
          })}
        </span>
        <button
          type="button"
          className={styles.primary}
          data-testid="mcp-add"
          onClick={() => setForm({ editing: null, initial: emptyMcpForm() })}
        >
          <Plus size={12} /> {t({ en: 'Add a server', fr: 'Ajouter un serveur' })}
        </button>
      </div>
      {error && <p className={styles.error}>{error}</p>}
      {servers.data?.servers.length === 0 && (
        <p className={styles.muted}>{t({ en: 'No MCP servers configured.', fr: 'Aucun serveur MCP configuré.' })}</p>
      )}
      <ul className={styles.list} data-testid="mcp-list">
        {servers.data?.servers.map((server) => (
          <ServerCard
            key={server.name}
            server={server}
            session={Boolean(sessionId)}
            sessionEnabled={!disabled.includes(server.name)}
            onSessionToggle={() => void toggleForSession(server.name)}
            onEdit={() => setForm({ editing: server.name, initial: mcpFormFrom(server) })}
            onChanged={servers.reload}
            onError={setError}
          />
        ))}
      </ul>
    </div>
  )
}
