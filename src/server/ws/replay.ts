/**
 * Missed events re-sent to a client resuming a session (session.load with
 * lastEventSeq): the same messages it would have received live, in order.
 */

import type { ServerMessage } from '../../shared/protocol.js'
import type { StoredEvent } from '../events/types.js'
import { storedEventToServerMessage } from './protocol.js'

type Chunk = { messageId: string; content: string; subAgentType?: string; toolCallId?: string; stream?: string }

/** Streamed fragments of the same message (or tool output stream) that can be merged into one. */
function chunkKey(event: StoredEvent): string | null {
  const data = event.data as Chunk
  switch (event.type) {
    case 'message.delta':
      return `delta|${data.messageId}|${data.subAgentType ?? ''}`
    case 'message.thinking':
      return `thinking|${data.messageId}`
    case 'tool.output':
      return `output|${data.messageId}|${data.toolCallId}|${data.stream}`
    default:
      return null
  }
}

/**
 * Convert missed events to server messages, merging consecutive fragments of
 * the same streamed message (deltas, thinking, tool output) so a long outage
 * during streaming replays as a handful of messages instead of thousands.
 * Each message carries the seq of the last event it covers.
 */
export function buildReplayMessages(events: StoredEvent[]): ServerMessage[] {
  const merged: StoredEvent[] = []
  let lastKey: string | null = null
  for (const event of events) {
    const key = chunkKey(event)
    const previous = merged[merged.length - 1]
    if (key !== null && key === lastKey && previous) {
      const data = previous.data as Chunk
      merged[merged.length - 1] = {
        ...previous,
        seq: event.seq,
        data: { ...data, content: data.content + (event.data as Chunk).content },
      }
    } else {
      merged.push(event)
    }
    lastKey = key
  }

  const messages: ServerMessage[] = []
  for (const event of merged) {
    const message = storedEventToServerMessage(event)
    if (message) messages.push({ ...message, seq: event.seq, sessionId: event.sessionId, replay: true })
  }
  return messages
}
