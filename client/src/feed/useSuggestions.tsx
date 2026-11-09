import { useEffect, useState, type KeyboardEvent, type RefObject } from 'react'
import { getJson } from '../api'
import { t } from '../i18n'
import { useApp, type NamedItem } from '../store/app'
import { activeTrigger, applySuggestion, remainingParams, type Suggestion } from './suggestions'
import styles from './Feed.module.css'

const MAX_SUGGESTIONS = 8
const FILE_SEARCH_DEBOUNCE_MS = 150

interface FileMatch {
  path: string
  name: string
}

interface Options {
  text: string
  setText: (text: string) => void
  cursor: number
  setCursor: (cursor: number) => void
  input: RefObject<HTMLTextAreaElement | null>
  workdir: string | undefined
}

function slashEntry(item: NamedItem, params: string[] | undefined): Suggestion {
  return { id: item.id, label: `/${item.id}`, detail: item.name, insert: `/${item.id} `, ...(params ? { params } : {}) }
}

/** `/` and `@` autocompletion, shared by the chat composer and the task editor. */
export function useSuggestions({ text, setText, cursor, setCursor, input, workdir }: Options) {
  const commands = useApp((state) => state.commands)
  const workflows = useApp((state) => state.workflows)
  const skills = useApp((state) => state.skills)
  const [selected, setSelected] = useState(0)
  const [fileMatches, setFileMatches] = useState<FileMatch[]>([])
  const [params, setParams] = useState<string[]>([])

  const trigger = activeTrigger(text, cursor)
  const needle = trigger?.query.toLowerCase() ?? ''
  const suggestions: Suggestion[] =
    trigger?.kind === 'slash'
      ? [
          ...workflows.map((w) =>
            slashEntry(
              w,
              w.parameters?.map((parameter) => parameter.id),
            ),
          ),
          ...commands.map((c) => slashEntry(c, c.paramNames)),
          ...skills.map((s) => slashEntry(s, undefined)),
        ]
          .filter((s) => s.label.toLowerCase().includes(needle))
          .slice(0, MAX_SUGGESTIONS)
      : trigger?.kind === 'mention'
        ? fileMatches
            .slice(0, MAX_SUGGESTIONS)
            .map((f) => ({ id: f.path, label: f.name, detail: f.path, insert: `@${f.path} ` }))
        : []

  const mentionQuery = trigger?.kind === 'mention' ? trigger.query : null
  useEffect(() => {
    if (mentionQuery === null || !workdir) return
    let active = true
    const timer = setTimeout(() => {
      void getJson<FileMatch[]>(
        `/api/files?q=${encodeURIComponent(mentionQuery)}&workdir=${encodeURIComponent(workdir)}`,
      ).then((found) => {
        if (active) setFileMatches(found)
      })
    }, FILE_SEARCH_DEBOUNCE_MS)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [mentionQuery, workdir])

  const pick = (suggestion: Suggestion) => {
    if (!trigger) return
    const next = applySuggestion(text, trigger, suggestion.insert)
    setText(next.text)
    setCursor(next.cursor)
    setSelected(0)
    setParams(suggestion.params ?? [])
    requestAnimationFrame(() => {
      input.current?.focus()
      input.current?.setSelectionRange(next.cursor, next.cursor)
    })
  }

  /** True when the key was consumed by the open list. */
  const handleKey = (event: KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (suggestions.length === 0) return false
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const delta = event.key === 'ArrowDown' ? 1 : -1
      setSelected((index) => (index + delta + suggestions.length) % suggestions.length)
      return true
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault()
      const suggestion = suggestions[Math.min(selected, suggestions.length - 1)]
      if (suggestion) pick(suggestion)
      return true
    }
    return false
  }

  const missingParams = text.startsWith('/') ? remainingParams(text, params) : 0

  return { suggestions, selected, pick, handleKey, missingParams, resetSelection: () => setSelected(0) }
}

interface ListProps {
  suggestions: Suggestion[]
  selected: number
  onPick: (suggestion: Suggestion) => void
}

export function SuggestionList({ suggestions, selected, onPick }: ListProps) {
  if (suggestions.length === 0) return null
  return (
    <ul className={styles.suggestions} data-testid="suggestions">
      {suggestions.map((suggestion, index) => (
        <li key={suggestion.id}>
          <button
            type="button"
            data-selected={index === selected || undefined}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onPick(suggestion)}
          >
            <span>{suggestion.label}</span>
            <span className={styles.suggestionDetail}>{suggestion.detail}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

export function ParamHint({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <div className={styles.paramHint} data-testid="param-hint">
      {t(
        {
          en: { one: '{{count}} required parameter', other: '{{count}} required parameters' },
          fr: { one: '{{count}} paramètre requis', other: '{{count}} paramètres requis' },
        },
        { count },
      )}
    </div>
  )
}
