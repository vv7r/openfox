import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Bot, Brain, Search, User } from 'lucide-react'
import { getLocale, type Translation } from '@shared/i18n/index.js'
import { deriveItems } from '../feed/items'
import { scrollFeedTo } from '../feed/navigation'
import { buildEntries, filterEntries, type SearchCategory, type SearchEntry } from '../feed/search'
import { t } from '../i18n'
import panelStyles from '../panels/Panels.module.css'
import { useFeed } from '../store/feed'
import styles from './AgentDialogs.module.css'

const STORAGE_KEY = 'openfox-message-search-filters'
const ROW_HEIGHT = 34
const OVERSCAN = 8

const CATEGORIES: Array<{ key: SearchCategory; label: Translation }> = [
  { key: 'user', label: { en: 'User prompts', fr: 'Invites' } },
  { key: 'thinking', label: { en: 'Thinking', fr: 'Réflexion' } },
  { key: 'response', label: { en: 'Responses', fr: 'Réponses' } },
]

function readFilters(): Set<SearchCategory> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return new Set(JSON.parse(stored) as SearchCategory[])
  } catch {
    // Back to every category
  }
  return new Set(CATEGORIES.map((category) => category.key))
}

function saveFilters(filters: Set<SearchCategory>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...filters]))
  } catch {
    // Only costs the choice on the next visit
  }
}

function formatStamp(iso: string): string {
  const date = new Date(iso)
  const today = date.toDateString() === new Date().toDateString()
  return today
    ? date.toLocaleTimeString(getLocale(), { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString(getLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function EntryIcon({ entry }: { entry: SearchEntry }) {
  if (entry.category === 'user') return <User size={13} />
  if (entry.category === 'thinking') return <Brain size={13} />
  return <Bot size={13} />
}

export function MessageSearch({ onClose }: { onClose: () => void }) {
  const entries = useMemo(() => {
    const { ids, byId } = useFeed.getState()
    return buildEntries(deriveItems(ids, byId), byId)
  }, [])
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState(readFilters)
  const [selected, setSelected] = useState(0)
  const list = useRef<HTMLDivElement>(null)
  const results = useMemo(() => filterEntries(entries, query, filters), [entries, query, filters])

  const virtualizer = useVirtualizer({
    count: results.length,
    getScrollElement: () => list.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
  })

  const toggle = (key: SearchCategory) => {
    const next = new Set(filters)
    if (!next.delete(key)) next.add(key)
    saveFilters(next)
    setFilters(next)
    setSelected(0)
  }

  const go = (entry: SearchEntry | undefined) => {
    if (!entry) return
    onClose()
    scrollFeedTo(entry.index)
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      go(results[selected])
      return
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const delta = event.key === 'ArrowDown' ? 1 : -1
    const next = Math.max(0, Math.min(results.length - 1, selected + delta))
    setSelected(next)
    virtualizer.scrollToIndex(next)
  }

  return (
    <div className={styles.search}>
      <div className={styles.searchBox}>
        <Search size={13} />
        <input
          autoFocus
          className={panelStyles.input}
          data-testid="message-search-input"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setSelected(0)
          }}
          onKeyDown={onKeyDown}
          placeholder={t({ en: 'Search timeline…', fr: 'Rechercher dans la chronologie…' })}
        />
      </div>
      <div className={styles.chips}>
        {CATEGORIES.map((category) => (
          <button
            key={category.key}
            type="button"
            className={styles.chip}
            aria-pressed={filters.has(category.key)}
            onClick={() => toggle(category.key)}
          >
            {t(category.label)}
          </button>
        ))}
      </div>
      <div ref={list} className={styles.results} data-testid="message-search-results">
        {results.length === 0 && (
          <p className={panelStyles.muted}>
            {entries.length > 0
              ? t({ en: 'No matches', fr: 'Aucun résultat' })
              : t({ en: 'No messages yet', fr: 'Aucun message pour le moment' })}
          </p>
        )}
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((row) => {
            const entry = results[row.index]!
            return (
              <button
                key={entry.key}
                type="button"
                className={styles.result}
                data-selected={row.index === selected || undefined}
                data-category={entry.category ?? undefined}
                style={{ transform: `translateY(${row.start}px)`, height: ROW_HEIGHT }}
                onClick={() => go(entry)}
              >
                <EntryIcon entry={entry} />
                <span className={styles.resultLabel}>{entry.label}</span>
                {entry.timestamp && <time>{formatStamp(entry.timestamp)}</time>}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
