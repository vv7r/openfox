import { useCallback, useLayoutEffect, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useFeed } from '../store/feed'
import { MessageItem } from './MessageItem'
import styles from './Feed.module.css'

const STICK_THRESHOLD_PX = 64

export function Feed() {
  const ids = useFeed((state) => state.ids)
  const scroller = useRef<HTMLDivElement>(null)
  const stuck = useRef(true)

  const virtualizer = useVirtualizer({
    count: ids.length,
    getScrollElement: () => scroller.current,
    getItemKey: (index) => ids[index] ?? index,
    estimateSize: () => 160,
    overscan: 3,
    useFlushSync: false,
  })

  const onScroll = useCallback(() => {
    const element = scroller.current
    if (element) stuck.current = element.scrollHeight - element.scrollTop - element.clientHeight < STICK_THRESHOLD_PX
  }, [])

  const totalSize = virtualizer.getTotalSize()
  useLayoutEffect(() => {
    const element = scroller.current
    if (element && stuck.current) element.scrollTop = element.scrollHeight
  }, [totalSize, ids.length])

  return (
    <div ref={scroller} className={styles.scroller} data-testid="chat-scroll-container" onScroll={onScroll}>
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
            <MessageItem id={ids[item.index]!} />
          </div>
        ))}
      </div>
    </div>
  )
}
