import { useMemo, useState, type ReactNode } from 'react'
import { Pencil, RefreshCw, Star } from 'lucide-react'
import { authFetch } from '../api'
import { reloadProviders, saveSetting, showSettings } from '../controller'
import { t } from '../i18n'
import { useApp } from '../store/app'
import { favoriteKey, parseFavorites, splitFavorite, toggleFavorite } from './modelFavorites'
import styles from './Feed.module.css'

interface Props {
  selected: string | undefined
  onPick: (providerId: string, modelId: string) => void
  /** Entries shown before the providers, such as "use the default model". */
  before?: ReactNode
  /** Shown after the providers. */
  after?: ReactNode
}

/** Searchable list of every provider's models, for the composer and the task editor. */
export function ModelList({ selected, onPick, before, after }: Props) {
  const providers = useApp((state) => state.providers)
  const favoritesSetting = useApp((state) => state.display['display.modelFavorites'])
  const collapseProviders = useApp((state) => state.display['display.collapseProvidersByDefault'] === 'true')
  const collapseFavorites = useApp((state) => state.display['display.collapseFavoritesByDefault'] === 'true')
  const [query, setQuery] = useState('')
  const [overrides, setOverrides] = useState<Record<string, boolean>>({})
  const [refreshing, setRefreshing] = useState<string | null>(null)
  const favorites = useMemo(() => parseFavorites(favoritesSetting), [favoritesSetting])
  const needle = query.trim().toLowerCase()

  const isCollapsed = (key: string, byDefault: boolean) => !needle && (overrides[key] ?? byDefault)
  const toggle = (key: string, byDefault: boolean) =>
    setOverrides((all) => ({ ...all, [key]: !(all[key] ?? byDefault) }))

  const groups = useMemo(
    () =>
      providers
        .map((provider) => ({
          provider,
          models: provider.models.filter((model) => model.id.toLowerCase().includes(needle)),
        }))
        .filter((group) => group.models.length > 0),
    [providers, needle],
  )

  const favoriteRows = useMemo(
    () =>
      favorites.flatMap((key) => {
        const { providerId, modelId } = splitFavorite(key)
        const provider = providers.find((item) => item.id === providerId)
        return provider?.models.some((model) => model.id === modelId) && modelId.toLowerCase().includes(needle)
          ? [{ key, provider, modelId }]
          : []
      }),
    [favorites, providers, needle],
  )

  const setFavorites = (next: string[]) => void saveSetting('display.modelFavorites', JSON.stringify(next))

  const refresh = (providerId: string) => {
    setRefreshing(providerId)
    void authFetch(`/api/providers/${providerId}/refresh`, { method: 'POST' })
      .then(() => reloadProviders())
      .finally(() => setRefreshing(null))
  }

  const row = (providerId: string, modelId: string, label: string, rowKey: string) => {
    const key = favoriteKey(providerId, modelId)
    const on = favorites.includes(key)
    return (
      <div key={rowKey} className={styles.pickerRow}>
        <button
          type="button"
          className={styles.pickerItem}
          data-selected={modelId === selected || undefined}
          onClick={() => onPick(providerId, modelId)}
        >
          {label}
        </button>
        <button
          type="button"
          className={styles.favoriteToggle}
          data-on={on || undefined}
          data-testid="model-favorite"
          aria-label={
            on
              ? t({ en: 'Remove from favorites', fr: 'Retirer des favoris' })
              : t({ en: 'Add to favorites', fr: 'Ajouter aux favoris' })
          }
          onClick={() => setFavorites(toggleFavorite(favorites, key))}
        >
          <Star size={12} />
        </button>
      </div>
    )
  }

  const favoritesCollapsed = isCollapsed('favorites', collapseFavorites)

  return (
    <>
      <input
        className={styles.pickerSearch}
        autoFocus
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t({ en: 'Search models…', fr: 'Rechercher des modèles…' })}
      />
      <div className={styles.pickerList}>
        {before}
        {favoriteRows.length > 0 && (
          <div>
            <div className={styles.pickerGroupRow}>
              <button
                type="button"
                className={styles.pickerGroup}
                onClick={() => toggle('favorites', collapseFavorites)}
              >
                {t({ en: 'Favorites', fr: 'Favoris' })}
              </button>
            </div>
            {!favoritesCollapsed &&
              favoriteRows.map(({ key, provider, modelId }) =>
                row(provider.id, modelId, `${provider.name} / ${modelId}`, `favorite-${key}`),
              )}
          </div>
        )}
        {groups.map(({ provider, models }) => {
          const collapsed = isCollapsed(provider.id, collapseProviders)
          return (
            <div key={provider.id}>
              <div className={styles.pickerGroupRow}>
                <button
                  type="button"
                  className={styles.pickerGroup}
                  aria-expanded={!collapsed}
                  onClick={() => toggle(provider.id, collapseProviders)}
                >
                  {provider.name}
                </button>
                <button
                  type="button"
                  className={styles.favoriteToggle}
                  aria-label={t({ en: 'Refresh models', fr: 'Actualiser les modèles' })}
                  title={t({ en: 'Refresh models', fr: 'Actualiser les modèles' })}
                  disabled={refreshing === provider.id}
                  onClick={() => refresh(provider.id)}
                >
                  <RefreshCw size={12} />
                </button>
                <button
                  type="button"
                  className={styles.favoriteToggle}
                  aria-label={t({ en: 'Edit provider', fr: 'Modifier le fournisseur' })}
                  title={t({ en: 'Edit provider', fr: 'Modifier le fournisseur' })}
                  onClick={() => showSettings('providers', { id: provider.id })}
                >
                  <Pencil size={12} />
                </button>
              </div>
              {!collapsed && models.map((model) => row(provider.id, model.id, model.id, model.id))}
            </div>
          )
        })}
        {groups.length === 0 && (
          <p className={styles.pickerEmpty}>{t({ en: 'No models match', fr: 'Aucun modèle ne correspond' })}</p>
        )}
        {after}
      </div>
    </>
  )
}
