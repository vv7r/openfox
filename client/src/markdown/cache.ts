import { useEffect, useState } from 'react'
import { scanBlocks } from './blocks'

const MAX_ENTRIES = 2000

type Listener = (html: string) => void

// Insertion order doubles as eviction order, so scrolling back through a
// virtualized feed finds its blocks already parsed.
const cache = new Map<string, string>()
let highlighting = true

/** Applies to blocks not rendered yet; what is cached keeps its colours until reloaded. */
export function setHighlighting(enabled: boolean): void {
  highlighting = enabled
}
const pending = new Map<string, Listener[]>()
const sourceById = new Map<number, string>()
let nextId = 0
let worker: Worker | null = null

function getWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (event: MessageEvent<{ id: number; html: string }>) => {
    const { id, html } = event.data
    const source = sourceById.get(id)
    if (source === undefined) return
    sourceById.delete(id)
    cache.set(source, html)
    if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value as string)
    pending.get(source)?.forEach((listener) => listener(html))
    pending.delete(source)
  }
  return worker
}

function request(source: string, listener: Listener): void {
  const listeners = pending.get(source)
  if (listeners) {
    listeners.push(listener)
    return
  }
  pending.set(source, [listener])
  const id = nextId++
  sourceById.set(id, source)
  getWorker().postMessage({ id, source, highlight: highlighting })
}

/** The block's HTML, or null while the worker has not produced it yet. */
export function useMarkdownHtml(source: string): string | null {
  const [state, setState] = useState(() => ({ source, html: cache.get(source) ?? null }))

  useEffect(() => {
    if (cache.has(source)) return
    let active = true
    request(source, (html) => {
      if (active) setState({ source, html })
    })
    return () => {
      active = false
    }
  }, [source])

  return state.source === source ? state.html : (cache.get(source) ?? null)
}

const ignore = () => {}

/**
 * Parses the blocks of finished messages ahead of time, newest first, so a message scrolled
 * into view shows at its final size instead of as raw text that then reflows.
 */
export function prewarmMarkdown(texts: string[]): void {
  for (const text of [...texts].reverse()) {
    const { blocks, offset } = scanBlocks(text, 0)
    const tail = text.slice(offset).trim()
    for (const source of tail ? [...blocks, tail] : blocks) {
      if (!cache.has(source)) request(source, ignore)
    }
  }
}
