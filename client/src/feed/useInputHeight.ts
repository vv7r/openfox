import { useLayoutEffect, useState, type PointerEvent, type RefObject } from 'react'

const STORAGE_KEY = 'openfox:composer-height'
const MIN_HEIGHT_PX = 40
const MAX_VIEWPORT_SHARE = 0.7
const MAX_AUTO_PX = 240
const MAX_AUTO_VIEWPORT_SHARE = 0.35

function savedHeight(): number | null {
  try {
    return Number(localStorage.getItem(STORAGE_KEY)) || null
  } catch {
    return null
  }
}

function remember(height: number | null): void {
  try {
    if (height === null) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, String(height))
  } catch {
    // The height simply follows the text next time
  }
}

/** The text sets the height, up to a limit; a height the user dragged to is only a minimum. */
export function inputHeight(content: number, manual: number | null, viewport: number): number {
  return Math.max(manual ?? 0, Math.min(content, MAX_AUTO_PX, viewport * MAX_AUTO_VIEWPORT_SHARE))
}

/** A selection deleted up from the end stops at a line start: the break it leaves is not wanted. */
export function trimTailDeletion(before: string, after: string): string {
  const removed = before.slice(after.length)
  return removed.length > 1 && removed.includes('\n') && before.startsWith(after) ? after.replace(/\n+$/, '') : after
}

export function useInputHeight(input: RefObject<HTMLTextAreaElement | null>, text: string) {
  const [manual, setManual] = useState<number | null>(savedHeight)

  useLayoutEffect(() => {
    const element = input.current
    if (!element) return
    element.style.height = 'auto'
    const content = element.scrollHeight + element.offsetHeight - element.clientHeight
    element.style.height = `${inputHeight(content, manual, window.innerHeight)}px`
  }, [input, text, manual])

  const startResize = (event: PointerEvent<HTMLDivElement>) => {
    if (!input.current) return
    event.preventDefault()
    const handle = event.currentTarget
    handle.setPointerCapture(event.pointerId)
    const startY = event.clientY
    const startHeight = input.current.offsetHeight
    let height: number | null = null

    const move = (e: globalThis.PointerEvent) => {
      // The composer sits at the bottom: dragging up makes it taller
      const wanted = startHeight + startY - e.clientY
      height = Math.round(Math.max(MIN_HEIGHT_PX, Math.min(window.innerHeight * MAX_VIEWPORT_SHARE, wanted)))
      setManual(height)
    }
    const up = () => {
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', up)
      if (height !== null) remember(height)
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', up)
  }

  const resetHeight = () => {
    setManual(null)
    remember(null)
  }

  return { startResize, resetHeight }
}
