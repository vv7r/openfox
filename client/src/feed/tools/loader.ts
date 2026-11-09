import { useSyncExternalStore } from 'react'

type ToolViews = typeof import('./ToolDetails')

let views: ToolViews | null = null
let loading = false
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  if (!views && !loading) {
    loading = true
    void import('./ToolDetails').then((module) => {
      views = module
      listeners.forEach((notify) => notify())
    })
  }
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The tool views once their chunk has arrived, kept out of the entry bundle. */
export function useToolViews(): ToolViews | null {
  return useSyncExternalStore(subscribe, () => views)
}
