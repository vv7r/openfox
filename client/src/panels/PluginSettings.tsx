import { useCallback, useEffect, useState } from 'react'
import type { LocalizedString, PluginSettingScope, PluginSettingsField, PluginSettingsSchema } from '@shared/plugin.js'
import { authFetch, getJson, sendJson } from '../api'
import { useLoad } from '../hooks'
import { t } from '../i18n'
import { buildSettingsPayload, initialFieldValue, localize, resolveLinkHref, type FieldValue } from '../plugins/core'
import { invokePluginRpc } from '../plugins/store'
import { useRoute } from '../router'
import { reloadProviders } from '../controller'
import styles from './Panels.module.css'

interface SettingsData {
  schema: PluginSettingsSchema
  values: Record<string, unknown>
  secretsSet: string[]
}

interface Status {
  running?: boolean
  installed?: boolean
  text?: string | LocalizedString
  tone?: string
}

type Row = Record<string, unknown>

function parseRows(value: FieldValue | undefined): Row[] {
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? (parsed as Row[]) : []
  } catch {
    return []
  }
}

function LinkButton({ field, values }: { field: PluginSettingsField; values: Row }) {
  if (!field.linkButton) return null
  const href = resolveLinkHref(field.linkButton, values)
  if (!/^https?:\/\//.test(href))
    return (
      <button type="button" disabled>
        {localize(field.linkButton.label)}
      </button>
    )
  return (
    <a className={styles.link} href={href} target="_blank" rel="noreferrer noopener">
      {localize(field.linkButton.label)}
    </a>
  )
}

function Input({
  field,
  value,
  onChange,
  context,
}: {
  field: PluginSettingsField
  value: FieldValue | undefined
  onChange: (next: FieldValue) => void
  context: Row
}) {
  const text = value === undefined ? '' : String(value)
  if (field.type === 'boolean')
    return <input type="checkbox" checked={value === true} onChange={(event) => onChange(event.target.checked)} />
  if (field.type === 'select') {
    return (
      <select className={styles.select} value={text} onChange={(event) => onChange(event.target.value)}>
        {field.options?.map((option) => (
          <option key={option.value} value={option.value}>
            {localize(option.label)}
          </option>
        ))}
      </select>
    )
  }
  if (field.type === 'textarea')
    return (
      <textarea
        className={styles.textarea}
        value={text}
        disabled={field.readOnly}
        onChange={(event) => onChange(event.target.value)}
      />
    )
  return (
    <div className={styles.row}>
      <input
        className={styles.input}
        type={field.type === 'password' || field.secret ? 'password' : field.type === 'number' ? 'number' : 'text'}
        value={text}
        disabled={field.readOnly}
        placeholder={field.placeholder}
        onChange={(event) =>
          onChange(
            field.type === 'number' && event.target.value !== '' ? Number(event.target.value) : event.target.value,
          )
        }
      />
      <LinkButton field={field} values={context} />
    </div>
  )
}

function ListField({
  field,
  value,
  onChange,
}: {
  field: PluginSettingsField
  value: FieldValue | undefined
  onChange: (next: FieldValue) => void
}) {
  const rows = parseRows(value)
  const save = (next: Row[]) => onChange(JSON.stringify(next))
  const canAdd = field.maxItems === undefined || rows.length < field.maxItems
  const canRemove = field.minItems === undefined || rows.length > field.minItems
  return (
    <div className={styles.stack}>
      {rows.map((row, index) => (
        <div key={index} className={styles.row}>
          {field.itemFields?.map((item) => (
            <label key={item.key} className={styles.field}>
              {localize(item.label)}
              <Input
                field={item}
                value={row[item.key] as FieldValue | undefined}
                context={row}
                onChange={(next) => save(rows.map((r, i) => (i === index ? { ...r, [item.key]: next } : r)))}
              />
            </label>
          ))}
          {canRemove && (
            <button type="button" onClick={() => save(rows.filter((_, i) => i !== index))}>
              {field.removeLabel ? localize(field.removeLabel) : t({ en: 'Remove', fr: 'Retirer' })}
            </button>
          )}
        </div>
      ))}
      {canAdd && (
        <button type="button" onClick={() => save([...rows, {}])}>
          {field.addLabel ? localize(field.addLabel) : t({ en: 'Add', fr: 'Ajouter' })}
        </button>
      )}
    </div>
  )
}

export function PluginSettingsForm({ pluginId }: { pluginId: string }) {
  const { projectId } = useRoute()
  const [scope, setScope] = useState<PluginSettingScope>('global')
  const query = new URLSearchParams({ scope, ...(projectId ? { projectId } : {}) }).toString()
  const url = `/api/plugins/${encodeURIComponent(pluginId)}/settings`
  const { data } = useLoad(() => getJson<SettingsData>(`${url}?${query}`), `${pluginId}?${query}`)
  const [values, setValues] = useState<Record<string, FieldValue>>({})
  const [statuses, setStatuses] = useState<Record<string, Status>>({})
  const [message, setMessage] = useState<string | null>(null)
  const fields = data?.schema.fields ?? []

  const refreshStatuses = useCallback(async () => {
    for (const field of data?.schema.fields.filter((f) => f.type === 'status') ?? []) {
      const result = (await invokePluginRpc(pluginId, field.rpcMethod ?? field.key, {}, {}).catch(() => null)) as
        (Status & { statusText?: Status['text'] }) | null
      setStatuses((all) => ({
        ...all,
        [field.key]: result
          ? { ...result, ...(result.statusText ? { text: result.statusText } : {}) }
          : { tone: 'error' },
      }))
    }
  }, [data, pluginId])

  useEffect(() => {
    if (!data) return
    setValues(
      Object.fromEntries(
        data.schema.fields.map((field) => [field.key, initialFieldValue(field, data.values, data.secretsSet)]),
      ),
    )
    void refreshStatuses()
  }, [data, refreshStatuses])

  if (!data) return null
  if (fields.length === 0) return null

  const save = async () => {
    setMessage(null)
    const response = await authFetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        values: buildSettingsPayload(fields, values),
        scope,
        ...(projectId ? { projectId } : {}),
      }),
    })
    setMessage(
      response.ok
        ? t({ en: 'Saved', fr: 'Enregistré' })
        : (((await response.json().catch(() => ({}))) as { error?: string }).error ??
            t({ en: 'Save failed', fr: 'Échec de l’enregistrement' })),
    )
    void reloadProviders()
  }

  const runButton = async (field: PluginSettingsField) => {
    setMessage(null)
    try {
      await invokePluginRpc(pluginId, field.rpcMethod ?? field.key, {}, {})
      await refreshStatuses()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t({ en: 'Action failed', fr: 'Action échouée' }))
    }
  }

  const installed = Object.values(statuses).some((status) => status.installed === true)
  const projectScoped = projectId !== undefined && fields.some((field) => field.scope === 'project')

  return (
    <div className={styles.form} data-testid={`plugin-settings-${pluginId}`}>
      {projectScoped && (
        <label className={styles.field}>
          {t({ en: 'Applies to', fr: 'S’applique à' })}
          <select
            className={styles.select}
            value={scope}
            onChange={(event) => setScope(event.target.value as PluginSettingScope)}
          >
            <option value="global">{t({ en: 'All projects', fr: 'Tous les projets' })}</option>
            <option value="project">{t({ en: 'This project', fr: 'Ce projet' })}</option>
          </select>
        </label>
      )}
      {fields.map((field) => {
        if (field.hideWhenInstalled && installed) return null
        if (field.parentKey && values[field.parentKey] !== true) return null
        const status = statuses[field.key]
        const set = (next: FieldValue) => setValues((all) => ({ ...all, [field.key]: next }))
        return (
          <div key={field.key} className={styles.field}>
            {field.section && <h4 className={styles.eyebrow}>{localize(field.section)}</h4>}
            {field.type !== 'button' && <span>{localize(field.label)}</span>}
            {field.type === 'status' ? (
              <span className={styles.row}>
                <span
                  className={styles.dot}
                  data-state={status?.running || status?.installed ? 'connected' : 'error'}
                />
                {typeof status?.text === 'object'
                  ? localize(status.text)
                  : (status?.text ??
                    (status?.running ? t({ en: 'Running', fr: 'Actif' }) : t({ en: 'Stopped', fr: 'Arrêté' })))}
              </span>
            ) : field.type === 'button' ? (
              <button
                type="button"
                className={field.buttonVariant === 'primary' ? styles.primary : undefined}
                onClick={() => void runButton(field)}
              >
                {localize(field.buttonLabel ?? field.label)}
              </button>
            ) : field.type === 'list' ? (
              <ListField field={field} value={values[field.key]} onChange={set} />
            ) : (
              <Input field={field} value={values[field.key]} onChange={set} context={values} />
            )}
            {field.description && <span className={styles.muted}>{localize(field.description)}</span>}
          </div>
        )
      })}
      <div className={styles.row}>
        <button type="button" className={styles.primary} data-testid="plugin-settings-save" onClick={() => void save()}>
          {t({ en: 'Save', fr: 'Enregistrer' })}
        </button>
        {message && <span className={styles.muted}>{message}</span>}
      </div>
    </div>
  )
}

interface RegistryPlugin {
  name: string
  displayName: string
  description: string
  githubUrl: string
}

export function PluginInstall({ installedNames, onChange }: { installedNames: string[]; onChange: () => void }) {
  const { data } = useLoad(() => getJson<{ plugins: RegistryPlugin[] }>('/api/plugins/registry'), 'registry')
  const [source, setSource] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const install = async (input: { githubUrl?: string; npm?: string; path?: string }) => {
    setBusy(true)
    setError(null)
    const response = await sendJson('/api/plugins/install', 'POST', input)
    setBusy(false)
    if (!response.ok) {
      setError(
        ((await response.json().catch(() => ({}))) as { error?: string }).error ??
          t({ en: 'Install failed', fr: 'Échec de l’installation' }),
      )
      return
    }
    setSource('')
    onChange()
  }

  const submit = () => {
    const value = source.trim()
    if (!value) return
    void install(
      /^https?:\/\//.test(value) ? { githubUrl: value } : value.startsWith('/') ? { path: value } : { npm: value },
    )
  }

  const available = data?.plugins.filter((plugin) => !installedNames.includes(plugin.name)) ?? []
  return (
    <section>
      <h3 className={styles.eyebrow}>{t({ en: 'Install a plugin', fr: 'Installer un plugin' })}</h3>
      <p className={styles.muted}>
        {t({
          en: 'Plugins run inside OpenFox with full access. Only install code you trust.',
          fr: 'Les plugins s’exécutent dans OpenFox avec tous les droits. N’installez que du code de confiance.',
        })}
      </p>
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.row}>
        <input
          className={styles.input}
          value={source}
          onChange={(event) => setSource(event.target.value)}
          placeholder={t({
            en: 'GitHub URL, npm package or absolute path',
            fr: 'URL GitHub, paquet npm ou chemin absolu',
          })}
        />
        <button type="button" disabled={busy || !source.trim()} onClick={submit}>
          {t({ en: 'Install', fr: 'Installer' })}
        </button>
      </div>
      <ul className={styles.list}>
        {available.map((plugin) => (
          <li key={plugin.name}>
            <span className={styles.grow}>
              {plugin.displayName}
              <div className={styles.muted}>{plugin.description}</div>
            </span>
            <button type="button" disabled={busy} onClick={() => void install({ githubUrl: plugin.githubUrl })}>
              {t({ en: 'Install', fr: 'Installer' })}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
