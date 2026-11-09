export interface BlockScan {
  /** Offset where the next unfinished block starts. */
  offset: number
  /** Blocks completed by this scan, in order. */
  blocks: string[]
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/

/**
 * Finds the markdown blocks that later text can no longer change, looking only
 * at text after `from`. Called on every streamed frame, so the cost follows the
 * new text and not the length of the message.
 */
export function scanBlocks(text: string, from: number): BlockScan {
  const blocks: string[] = []
  let blockStart = from
  let lineStart = from
  let fence: string | null = null

  const close = (end: number) => {
    const block = text.slice(blockStart, end).trim()
    if (block) blocks.push(block)
    blockStart = end
  }

  while (true) {
    const newline = text.indexOf('\n', lineStart)
    if (newline === -1) break
    const line = text.slice(lineStart, newline)
    const next = newline + 1
    const marker = FENCE.exec(line)?.[1]

    if (fence) {
      if (marker && marker[0] === fence[0] && marker.length >= fence.length && line.trim() === marker) {
        fence = null
        close(next)
      }
    } else if (marker) {
      if (text.slice(blockStart, lineStart).trim()) close(lineStart)
      fence = marker
    } else if (line.trim() === '') {
      // The block ends only once the following line shows it is not a
      // continuation (indented list content) or still unknown.
      let peek = next
      while (text[peek] === '\n') peek++
      const following = text[peek]
      if (following === undefined) break
      if (following !== ' ' && following !== '\t') close(next)
    }
    lineStart = next
  }

  return { offset: blockStart, blocks }
}
