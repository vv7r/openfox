import { useMemo, useState, type ReactNode } from 'react'
import { t } from '../i18n'
import { useApp } from '../store/app'
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
  const [query, setQuery] = useState('')

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return providers
      .map((provider) => ({
        provider,
        models: provider.models.filter((model) => model.id.toLowerCase().includes(needle)),
      }))
      .filter((group) => group.models.length > 0)
  }, [providers, query])

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
        {groups.map(({ provider, models }) => (
          <div key={provider.id}>
            <div className={styles.pickerGroup}>{provider.name}</div>
            {models.map((model) => (
              <button
                key={model.id}
                type="button"
                className={styles.pickerItem}
                data-selected={model.id === selected || undefined}
                onClick={() => onPick(provider.id, model.id)}
              >
                {model.id}
              </button>
            ))}
          </div>
        ))}
        {groups.length === 0 && (
          <p className={styles.pickerEmpty}>{t({ en: 'No models match', fr: 'Aucun modèle ne correspond' })}</p>
        )}
        {after}
      </div>
    </>
  )
}
