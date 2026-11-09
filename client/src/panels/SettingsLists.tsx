import { useState, type FormEvent } from 'react'
import { authFetch, getJson, sendJson } from '../api'
import { reloadProviders } from '../controller'
import { useLoad } from '../hooks'
import { loadPlugins, usePlugins } from '../plugins/store'
import { PluginInstall, PluginSettingsForm } from './PluginSettings'
import { t } from '../i18n'
import { useApp } from '../store/app'
import styles from './Panels.module.css'

export function ProvidersTab() {
  const providers = useApp((state) => state.providers)
  const [form, setForm] = useState({ name: '', url: '', backend: 'auto', apiKey: '' })
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const act = async (request: Promise<Response>) => {
    setError(null)
    const response = await request
    if (!response.ok)
      setError(
        ((await response.json().catch(() => ({}))) as { error?: string }).error ??
          t({ en: 'Action failed', fr: 'Action échouée' }),
      )
    await reloadProviders()
    return response.ok
  }

  const add = async (event: FormEvent) => {
    event.preventDefault()
    if (await act(sendJson('/api/providers', 'POST', form))) setForm({ name: '', url: '', backend: 'auto', apiKey: '' })
  }

  const field = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (event: { target: { value: string } }) => setForm({ ...form, [key]: event.target.value }),
  })

  return (
    <div className={styles.stack}>
      {error && <p className={styles.error}>{error}</p>}
      <ul className={styles.list} data-testid="providers">
        {providers.map((provider) => (
          <li key={provider.id}>
            <span className={styles.grow}>
              {provider.name}
              <span className={styles.muted}>{` · ${provider.models.length} · ${provider.url ?? ''}`}</span>
            </span>
            {provider.isActive ? (
              <span className={styles.muted}>{t({ en: 'active', fr: 'actif' })}</span>
            ) : (
              <button
                type="button"
                onClick={() => void act(authFetch(`/api/providers/${provider.id}/activate`, { method: 'POST' }))}
              >
                {t({ en: 'Activate', fr: 'Activer' })}
              </button>
            )}
            <button
              type="button"
              onClick={() => void act(authFetch(`/api/providers/${provider.id}/refresh`, { method: 'POST' }))}
            >
              {t({ en: 'Refresh', fr: 'Actualiser' })}
            </button>
            {deleting === provider.id ? (
              <button
                type="button"
                onClick={() => {
                  setDeleting(null)
                  void act(authFetch(`/api/providers/${provider.id}`, { method: 'DELETE' }))
                }}
              >
                {t({ en: 'Confirm', fr: 'Confirmer' })}
              </button>
            ) : (
              <button type="button" onClick={() => setDeleting(provider.id)}>
                {t({ en: 'Delete', fr: 'Supprimer' })}
              </button>
            )}
          </li>
        ))}
      </ul>
      <form onSubmit={(event) => void add(event)}>
        <h3 className={styles.eyebrow}>{t({ en: 'Add a provider', fr: 'Ajouter un fournisseur' })}</h3>
        <div className={styles.row}>
          <input className={styles.input} required {...field('name')} placeholder={t({ en: 'Name', fr: 'Nom' })} />
          <input className={styles.input} required {...field('url')} placeholder={t({ en: 'URL', fr: 'URL' })} />
          <input
            className={styles.input}
            type="password"
            {...field('apiKey')}
            placeholder={t({ en: 'API key', fr: 'Clé API' })}
          />
          <button type="submit" className={styles.primary}>
            {t({ en: 'Add', fr: 'Ajouter' })}
          </button>
        </div>
      </form>
    </div>
  )
}

interface LibraryItem {
  id: string
  name: string
}

interface Skill extends LibraryItem {
  enabled: boolean
  description?: string
}

export function SkillsTab() {
  const { data, reload } = useLoad(() => getJson<{ items: Skill[] }>('/api/skills'), 'skills')
  const toggle = async (id: string) => {
    await authFetch(`/api/skills/${encodeURIComponent(id)}/toggle`, { method: 'POST' })
    reload()
  }
  return (
    <ul className={styles.list}>
      {data?.items.map((skill) => (
        <li key={skill.id}>
          <input
            type="checkbox"
            checked={skill.enabled}
            aria-label={skill.name}
            onChange={() => void toggle(skill.id)}
          />
          <span className={styles.grow}>
            {skill.name}
            {skill.description && <div className={styles.muted}>{skill.description}</div>}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function PluginsTab() {
  const plugins = usePlugins((state) => state.plugins)
  const sections = usePlugins((state) => state.contributions.sections)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const action = async (id: string, name: string) => {
    setError(null)
    const response = await authFetch(`/api/plugins/${encodeURIComponent(id)}/${name}`, { method: 'POST' })
    if (!response.ok)
      setError(
        ((await response.json().catch(() => ({}))) as { error?: string }).error ??
          t({ en: 'Action failed', fr: 'Action échouée' }),
      )
    await loadPlugins()
  }

  return (
    <div className={styles.stack}>
      {error && <p className={styles.error}>{error}</p>}
      <ul className={styles.list} data-testid="plugins">
        {plugins.map((plugin) => (
          <li key={plugin.id} className={styles.column}>
            <div className={styles.row}>
              <input
                type="checkbox"
                checked={plugin.enabled}
                aria-label={plugin.displayName}
                onChange={() => void action(plugin.id, plugin.enabled ? 'disable' : 'enable')}
              />
              <span className={styles.grow}>
                {plugin.displayName}
                <span className={styles.muted}>{plugin.version ? ` ${plugin.version}` : ''}</span>
                {plugin.description && <div className={styles.muted}>{plugin.description}</div>}
              </span>
              {sections.some((section) => section.pluginId === plugin.id) && (
                <button
                  type="button"
                  data-testid={`plugin-configure-${plugin.id}`}
                  onClick={() => setOpen(open === plugin.id ? null : plugin.id)}
                >
                  {t({ en: 'Configure', fr: 'Configurer' })}
                </button>
              )}
              <button type="button" onClick={() => void action(plugin.id, 'reinstall')}>
                {t({ en: 'Reinstall', fr: 'Réinstaller' })}
              </button>
              {plugin.removable &&
                (confirming === plugin.id ? (
                  <button
                    type="button"
                    onClick={() => {
                      setConfirming(null)
                      void action(plugin.id, 'uninstall')
                    }}
                  >
                    {t({ en: 'Confirm', fr: 'Confirmer' })}
                  </button>
                ) : (
                  <button type="button" onClick={() => setConfirming(plugin.id)}>
                    {t({ en: 'Uninstall', fr: 'Désinstaller' })}
                  </button>
                ))}
            </div>
            {open === plugin.id && <PluginSettingsForm pluginId={plugin.id} />}
          </li>
        ))}
      </ul>
      <PluginInstall installedNames={plugins.map((plugin) => plugin.id)} onChange={() => void loadPlugins()} />
    </div>
  )
}
