import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowDown } from 'lucide-react'
import { t } from '../i18n'
import { useRoute } from '../router'
import { useApp } from '../store/app'
import { prewarmMarkdown } from '../markdown/cache'
import { useFeed } from '../store/feed'
import { estimateItemHeight } from './estimate'
import { deriveItems } from './items'
import { registerFeedScroll } from './navigation'
import { FeedRow } from './MessageItem'
import styles from './Feed.module.css'

const UpNext = lazy(() => import('./UpNext'))

const STICK_THRESHOLD_PX = 64
const FALLBACK_WIDTH_PX = 360
/** Rows rendered beyond the screen: scrolling up meets them already laid out. */
const OVERSCAN_ROWS = 6
const PREWARM_DELAY_MS = 300
/** Messages already handed to the parser: an agent turn adds one at a time, the rest is done. */
const prewarmed = new Set<string>()

export function Feed() {
  const ids = useFeed((state) => state.ids)
  const hidden = useFeed((state) => state.hiddenCount)
  const { projectId, sessionId } = useRoute()
  const sessionLoaded = useApp((state) => state.session !== null)
  const scroller = useRef<HTMLDivElement>(null)
  const stuck = useRef(true)
  const [scrolledUp, setScrolledUp] = useState(false)
  const items = useMemo(() => deriveItems(ids, useFeed.getState().byId), [ids])

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scroller.current,
    getItemKey: (index) => items[index]?.key ?? index,
    estimateSize: (index) => {
      const item = items[index]
      return item
        ? estimateItemHeight(item, useFeed.getState().byId, scroller.current?.clientWidth ?? FALLBACK_WIDTH_PX)
        : 0
    },
    overscan: OVERSCAN_ROWS,
    useFlushSync: false,
  })

  const onScroll = useCallback(() => {
    const element = scroller.current
    if (!element) return
    stuck.current = element.scrollHeight - element.scrollTop - element.clientHeight < STICK_THRESHOLD_PX
    setScrolledUp(!stuck.current)
  }, [])

  const backToLive = () => {
    const element = scroller.current
    if (!element) return
    stuck.current = true
    setScrolledUp(false)
    element.scrollTop = element.scrollHeight
  }

  useEffect(
    () =>
      registerFeedScroll((index) => {
        stuck.current = false
        virtualizer.scrollToIndex(index, { align: 'center' })
      }),
    [virtualizer],
  )

  // In the background, after the visible rows have asked for theirs
  useEffect(() => {
    const timer = setTimeout(() => {
      const { byId } = useFeed.getState()
      prewarmMarkdown(
        ids.flatMap((id) => {
          const message = byId[id]
          if (prewarmed.has(id) || message?.role !== 'assistant' || message.isStreaming || !message.content) return []
          prewarmed.add(id)
          return [message.content]
        }),
      )
    }, PREWARM_DELAY_MS)
    return () => clearTimeout(timer)
  }, [ids])

  const totalSize = virtualizer.getTotalSize()
  useLayoutEffect(() => {
    const element = scroller.current
    if (element && stuck.current) element.scrollTop = element.scrollHeight
  }, [totalSize, items.length])

  return (
    <div className={styles.feed}>
      <div ref={scroller} className={styles.scroller} data-testid="chat-scroll-container" onScroll={onScroll}>
        {hidden > 0 && (
          <a
            className={styles.fullHistory}
            data-testid="full-history"
            href={`/p/${projectId}/s/${sessionId}/readonly`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t(
              {
                en: '{{count}} older items hidden, view the full history',
                fr: '{{count}} éléments plus anciens masqués, voir l’historique complet',
              },
              { count: hidden },
            )}
          </a>
        )}
        {ids.length === 0 && sessionLoaded && (
          <Suspense fallback={null}>
            <UpNext />
          </Suspense>
        )}
        <div className={styles.spacer} style={{ height: totalSize }}>
          {virtualizer.getVirtualItems().map((item) => (
            <div
              key={item.key}
              ref={virtualizer.measureElement}
              className={styles.item}
              data-index={item.index}
              data-item-index={item.index}
              style={{ transform: `translateY(${item.start}px)` }}
            >
              <FeedRow item={items[item.index]!} />
            </div>
          ))}
        </div>
      </div>
      {scrolledUp && (
        <button type="button" className={styles.toBottom} data-testid="feed-to-bottom" onClick={backToLive}>
          <ArrowDown size={14} />
          {t({ en: 'Back to bottom', fr: 'Revenir en bas' })}
        </button>
      )}
    </div>
  )
}
