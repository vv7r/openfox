import { memo, useRef } from 'react'
import type { Message } from '@shared/types.js'
import { scanBlocks } from '../markdown/blocks'
import { useMarkdownHtml } from '../markdown/cache'
import { useFeed } from '../store/feed'
import styles from './Feed.module.css'

const Block = memo(function Block({ source }: { source: string }) {
  const html = useMarkdownHtml(source)
  if (html === null) return <div className={styles.pending}>{source}</div>
  return <div className={styles.block} dangerouslySetInnerHTML={{ __html: html }} />
})

/** Finished blocks never re-render; only the open tail changes on each frame. */
function Markdown({ text, streaming }: { text: string; streaming: boolean }) {
  const scan = useRef({ offset: 0, blocks: [] as string[], length: 0 })
  if (text.length < scan.current.length) scan.current = { offset: 0, blocks: [], length: 0 }
  const found = scanBlocks(text, scan.current.offset)
  if (found.blocks.length > 0) {
    scan.current = { offset: found.offset, blocks: [...scan.current.blocks, ...found.blocks], length: text.length }
  } else {
    scan.current.length = text.length
  }

  const tail = text.slice(scan.current.offset).trim()
  return (
    <>
      {scan.current.blocks.map((block, index) => (
        <Block key={index} source={block} />
      ))}
      {tail && (streaming ? <div className={styles.tail}>{tail}</div> : <Block source={tail} />)}
    </>
  )
}

function Body({ message }: { message: Message }) {
  if (message.role === 'user') return <div className={styles.user}>{message.content}</div>
  return (
    <>
      {message.thinkingContent && (
        <details className={styles.thinking}>
          <summary>{'…'}</summary>
          {message.thinkingContent}
        </details>
      )}
      <Markdown text={message.content} streaming={message.isStreaming === true} />
      {message.toolCalls?.map((call) => (
        <div key={call.id} className={styles.tool}>
          {call.name}
        </div>
      ))}
    </>
  )
}

export const MessageItem = memo(function MessageItem({ id }: { id: string }) {
  const message = useFeed((state) => state.byId[id])
  return message ? <Body message={message} /> : null
})
