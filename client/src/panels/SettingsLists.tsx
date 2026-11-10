import { lazy, Suspense, useEffect, useState } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { authFetch, getJson, sendJson } from '../api'
import { useLoad } from '../hooks'
import { reloadProviders } from '../controller'
import { PluginZone, usePluginContext } from '../plugins/Slots'
import { loadPlugins, usePlugins } from '../plugins/store'
import { PluginInstall, PluginSettingsForm } from './PluginSettings'
import { t } from '../i18n'
import { useApp } from '../store/app'
import type { EditableProvider } from './providers/ProviderWizard'
import { moveInList } from './providers/wizard'
import styles from './Panels.module.css'

const ProviderWizard = lazy(() => import('./providers/ProviderWizard'))

type WizardState = { edit: EditableProvider | null } | null

export function ProvidersTab() {
  const providers = useApp((state) => state.providers)
  const settingsEdit = useApp((state) => state.settingsEdit)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [wizard, setWizard] = useState<WizardState>(null)
  const pluginContext = usePluginContext()

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

  const move = (index: number, direction: -1 | 1) => {
    const order = moveInList(
      providers.map((provider) => provider.id),
      index,
      direction,
    )
    void act(sendJson('/api/providers/order', 'PUT', { providerIds: order }))
  }

  // Opening straight on a provider, from the model picker's edit button
  useEffect(() => {
    if (!settingsEdit) return
    const provider = providers.find((item) => item.id === settingsEdit.id)
    if (provider) setWizard({ edit: provider as unknown as EditableProvider })
    useApp.setState({ settingsEdit: null })
  }, [settingsEdit, providers])

  return (
    <div className={styles.stack}>
      {error && <p className={styles.error}>{error}</p>}
      <PluginZone id="providers.modal" context={pluginContext}>
        <ul className={styles.list} data-testid="providers">
          {providers.map((provider, index) => (
            <li key={provider.id}>
              <button
                type="button"
                aria-label={t({ en: 'Move up', fr: 'Monter' })}
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                <ArrowUp size={12} />
              </button>
              <button
                type="button"
                aria-label={t({ en: 'Move down', fr: 'Descendre' })}
                disabled={index === providers.length - 1}
                onClick={() => move(index, 1)}
              >
                <ArrowDown size={12} />
              </button>
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
                data-testid="provider-edit"
                onClick={() => setWizard({ edit: provider as unknown as EditableProvider })}
              >
                {t({ en: 'Edit', fr: 'Modifier' })}
              </button>
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
      </PluginZone>
      <PluginZone id="modal.footer" context={pluginContext}>
        <button
          type="button"
          className={styles.primary}
          data-testid="provider-add"
          onClick={() => setWizard({ edit: null })}
        >
          {t({ en: 'Add a provider', fr: 'Ajouter un fournisseur' })}
        </button>
      </PluginZone>
      {wizard && (
        <Suspense fallback={null}>
          <ProviderWizard edit={wizard.edit} onClose={() => setWizard(null)} />
        </Suspense>
      )}
    </div>
  )
}

interface PluginDiagnostic {
  packageName: string
  version?: string
  source: string
  loaded: boolean
  error?: string
}

function PluginDiagnostics() {
  const { data } = useLoad(
    () => getJson<{ diagnostics: PluginDiagnostic[] }>('/api/plugins/diagnostics'),
    'diagnostics',
  )
  const failed = data?.diagnostics.filter((item) => !item.loaded || item.error) ?? []
  if (failed.length === 0) return null
  return (
    <section data-testid="plugin-diagnostics">
      <h3 className={styles.eyebrow}>{t({ en: 'Diagnostics', fr: 'Diagnostics' })}</h3>
      <ul className={styles.list}>
        {failed.map((item) => (
          <li key={item.packageName} className={styles.column}>
            <span>
              {item.packageName}
              {item.version && <span className={styles.muted}>{` v${item.version}`}</span>}
            </span>
            <span className={styles.muted}>{item.source}</span>
            <span className={styles.error}>
              {item.error ?? t({ en: 'Plugin did not load', fr: 'Le plugin ne s’est pas chargé' })}
            </span>
          </li>
        ))}
      </ul>
    </section>
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
      <PluginDiagnostics />
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
              <button
                type="button"
                data-testid={`plugin-open-folder-${plugin.id}`}
                onClick={() =>
                  void authFetch(`/api/plugins/${encodeURIComponent(plugin.id)}/open-folder`).then((response) => {
                    if (!response.ok)
                      setError(
                        t({ en: 'Could not open the plugin folder', fr: 'Impossible d’ouvrir le dossier du plugin' }),
                      )
                  })
                }
              >
                {t({ en: 'Open folder', fr: 'Ouvrir le dossier' })}
              </button>
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
