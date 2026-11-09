import { useCallback, useEffect, useState } from 'react'
import { subscribeMessages } from './controller'

/** Loads on mount and when `key` changes; a stale response never overwrites a newer one. */
export function useLoad<T>(load: () => Promise<T>, key: string): { data: T | null; reload: () => void } {
  const [state, setState] = useState<{ key: string; data: T } | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let active = true
    void load()
      .then((data) => {
        if (active) setState({ key, data })
      })
      .catch(() => {})
    return () => {
      active = false
    }
    // `load` closes over what `key` identifies
  }, [key, version])

  return { data: state?.key === key ? state.data : null, reload: useCallback(() => setVersion((v) => v + 1), []) }
}

/** Runs `onEvent` for server events whose type starts with one of `prefixes`. */
export function useServerEvents(prefixes: string[], onEvent: () => void): void {
  const joined = prefixes.join(',')
  useEffect(() => {
    const list = joined.split(',')
    return subscribeMessages((message) => {
      if (list.some((prefix) => message.type.startsWith(prefix))) onEvent()
    })
  }, [joined, onEvent])
}
