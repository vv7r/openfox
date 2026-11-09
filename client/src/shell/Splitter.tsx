import type { PointerEvent, RefObject } from 'react'
import { useApp } from '../store/app'
import styles from './Shell.module.css'

const MIN_PANE_PX = 320

const widthVar = (layout: string) => `--agent-w-${layout}`

function storageKey(layout: string): string {
  return `openfox:agent-width:${layout}`
}

/** Restores the widths this browser last dragged. */
export function restoreWidths(element: HTMLElement): void {
  for (const layout of ['editor-first', 'agent-first']) {
    try {
      const saved = localStorage.getItem(storageKey(layout))
      if (saved) element.style.setProperty(widthVar(layout), saved)
    } catch {
      return
    }
  }
}

export function Splitter({ panes }: { panes: RefObject<HTMLDivElement | null> }) {
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const container = panes.current
    const agent = event.currentTarget.parentElement
    if (!container || !agent) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)

    const layout = useApp.getState().layout
    const startX = event.clientX
    const startWidth = agent.getBoundingClientRect().width
    // The agent grows leftwards when it is the last column
    const direction = layout === 'editor-first' ? -1 : 1
    const max = container.getBoundingClientRect().width - MIN_PANE_PX
    let width = `${startWidth}px`

    const handle = event.currentTarget
    const move = (e: globalThis.PointerEvent) => {
      width = `${Math.round(Math.min(max, Math.max(MIN_PANE_PX, startWidth + direction * (e.clientX - startX))))}px`
      // Straight to CSS: a drag must not re-render the feed
      container.style.setProperty(widthVar(layout), width)
    }
    const up = () => {
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', up)
      try {
        localStorage.setItem(storageKey(layout), width)
      } catch {
        // The default width is fine next time
      }
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', up)
  }

  return <div className={styles.splitter} role="separator" aria-orientation="vertical" onPointerDown={onPointerDown} />
}
