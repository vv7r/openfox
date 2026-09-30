/**
 * Page-side instrumentation for the mobile performance bench.
 *
 * Kept as source strings on purpose: the TS transpiler injects `__name(...)`
 * helpers into function bodies, which do not exist in the page (same reason as
 * scripts/bench/web-memory.ts). They are installed with `addInitScript`, i.e.
 * before any app script runs — the React hook must exist before React loads.
 */

/**
 * Records into `window.__perf`:
 *  - `longTasks`: [startTime, duration] of every long task (> 50 ms)
 *  - `frames`: timestamp of every animation frame
 *  - `heap`: [time, usedJSHeapSize] every 500 ms (needs --enable-precise-memory-info)
 *  - `renders` / `commits`: per-component render counts while `counting` is true
 *
 * Render counting uses a minimal React DevTools hook. On each commit it walks
 * only the paths that did work: React bubbles the PerformedWork flag (bit 1)
 * into `subtreeFlags` for re-rendered subtrees and strips it for bailed-out
 * ones, so untouched subtrees are pruned and the walk stays cheap.
 */
export const PERF_PROBE_SOURCE = `(() => {
  const P = { longTasks: [], frames: [], heap: [], renders: {}, commits: 0, counting: false }
  window.__perf = P
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) P.longTasks.push([e.startTime, e.duration])
    }).observe({ type: 'longtask', buffered: true })
  } catch (e) {}
  const tick = (t) => { P.frames.push(t); requestAnimationFrame(tick) }
  requestAnimationFrame(tick)
  setInterval(() => {
    if (performance.memory) P.heap.push([performance.now(), performance.memory.usedJSHeapSize])
  }, 500)

  const PERFORMED_WORK = 1
  const COUNTED_TAGS = new Set([0, 1, 11, 15])
  const nameOf = (fiber) => {
    const type = fiber.type
    if (typeof type === 'function') return type.displayName || type.name || 'Anonymous'
    if (type && typeof type === 'object') {
      const inner = type.type || type.render
      return type.displayName || (inner && (inner.displayName || inner.name)) || 'Anonymous'
    }
    return 'Anonymous'
  }
  const walk = (fiber) => {
    while (fiber) {
      if ((fiber.flags & PERFORMED_WORK) && COUNTED_TAGS.has(fiber.tag)) {
        const name = nameOf(fiber)
        P.renders[name] = (P.renders[name] || 0) + 1
      }
      if (fiber.child && (fiber.subtreeFlags & PERFORMED_WORK)) walk(fiber.child)
      fiber = fiber.sibling
    }
  }
  let rendererId = 0
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    renderers: new Map(),
    supportsFiber: true,
    isDisabled: false,
    inject(renderer) { rendererId++; this.renderers.set(rendererId, renderer); return rendererId },
    checkDCE() {},
    onScheduleFiberRoot() {},
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    onCommitFiberRoot(_id, root) {
      if (!P.counting) return
      P.commits++
      const current = root.current
      if (current && (current.subtreeFlags & PERFORMED_WORK)) walk(current.child)
    },
  }
})()`

/**
 * Simulates a network drop for the reconnection scenario, in `window.__net`:
 *  - `cut()` closes every live WebSocket and makes new ones fail (they dial a
 *    closed port, so they error out like a dead network) and rejects `fetch`
 *  - `restore()` lets connections through again
 *  - `opens`: timestamps of every successful WebSocket open
 */
export const NETWORK_CUT_SOURCE = `(() => {
  const N = { blocked: false, sockets: new Set(), opens: [] }
  window.__net = N
  const NativeWebSocket = window.WebSocket
  class PerfWebSocket extends NativeWebSocket {
    constructor(url, protocols) {
      super(N.blocked ? 'ws://127.0.0.1:9/perf-blocked' : url, protocols)
      if (N.blocked) return
      N.sockets.add(this)
      this.addEventListener('open', () => N.opens.push(performance.now()))
      this.addEventListener('close', () => N.sockets.delete(this))
    }
  }
  window.WebSocket = PerfWebSocket
  const nativeFetch = window.fetch.bind(window)
  window.fetch = (...args) => (N.blocked ? Promise.reject(new TypeError('Failed to fetch')) : nativeFetch(...args))
  N.cut = () => {
    N.blocked = true
    for (const socket of N.sockets) socket.close()
  }
  N.restore = () => { N.blocked = false }
})()`

/**
 * Async function source: from the bottom of the chat feed, scrolls up 100 px
 * per animation frame for exactly 240 frames (a fast finger flick through the
 * history). A fixed workload, independent of how many older items the feed
 * reveals along the way, keeps runs comparable. Returns page timestamps and
 * how many feed items are mounted at the end.
 */
export const SCROLL_UP_SOURCE = `async (selector) => {
  const host = document.querySelector(selector)
  if (!host) throw new Error('Missing chat scroll container')
  const viewport = host.querySelector('[data-overlayscrollbars-viewport]') || host
  const nextFrame = () => new Promise((done) => requestAnimationFrame(done))
  viewport.scrollTop = viewport.scrollHeight
  await nextFrame()
  const start = performance.now()
  for (let frame = 0; frame < 240; frame++) {
    viewport.scrollTop = Math.max(0, viewport.scrollTop - 100)
    await nextFrame()
  }
  return {
    start,
    end: performance.now(),
    mountedItems: document.querySelectorAll('[data-item-index]:not([data-placeholder])').length,
  }
}`

/**
 * Lets the bench hide the page: headless Chromium always reports it visible.
 * Overrides document.hidden / visibilityState and fires visibilitychange, which
 * is what the app reacts to. `window.__setHidden(true|false)`.
 */
export const PAGE_VISIBILITY_SOURCE = `(() => {
  let hidden = false
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') })
  window.__setHidden = (value) => {
    hidden = value
    document.dispatchEvent(new Event('visibilitychange'))
    return performance.now()
  }
})()`

export interface PageProbeData {
  longTasks: Array<[number, number]>
  frames: number[]
  heap: Array<[number, number]>
  renders: Record<string, number>
  commits: number
}
