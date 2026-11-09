import { create } from 'zustand'
import type {
  ChatDeltaPayload,
  ChatMessagePayload,
  ChatMessageUpdatedPayload,
  ServerMessage,
  SessionStatePayload,
} from '@shared/protocol.js'
import type { Message } from '@shared/types.js'
import { bufferDelta, flushDeltas, setDeltaFlush, type PendingDelta } from './deltaBuffer'

export interface FeedState {
  sessionId: string | null
  ids: string[]
  byId: Record<string, Message>
  /** True once the history came from REST: a later empty snapshot must not wipe it. */
  loaded: boolean
}

export const useFeed = create<FeedState>(() => ({ sessionId: null, ids: [], byId: {}, loaded: false }))

export function setHistory(sessionId: string, messages: Message[]): void {
  useFeed.setState({
    sessionId,
    ids: messages.map((message) => message.id),
    byId: Object.fromEntries(messages.map((message) => [message.id, message])),
    loaded: true,
  })
}

function applyDeltas(deltas: Map<string, PendingDelta>): void {
  const { byId } = useFeed.getState()
  const next = { ...byId }
  for (const [id, delta] of deltas) {
    const message = next[id]
    if (!message) {
      // The stream can outrun the chat.message that creates its target
      if (delta.content) bufferDelta(id, 'content', delta.content)
      if (delta.thinking) bufferDelta(id, 'thinking', delta.thinking)
      continue
    }
    next[id] = {
      ...message,
      content: message.content + delta.content,
      ...(delta.thinking ? { thinkingContent: (message.thinkingContent ?? '') + delta.thinking } : {}),
    }
  }
  useFeed.setState({ byId: next })
}

setDeltaFlush(applyDeltas)

export function applyServerMessage(message: ServerMessage): void {
  const state = useFeed.getState()
  if (message.sessionId && message.sessionId !== state.sessionId) return

  switch (message.type) {
    case 'session.state': {
      if (state.loaded) return
      const payload = message.payload as SessionStatePayload
      setHistory(payload.session.id, payload.messages)
      return
    }
    case 'chat.message': {
      const payload = message.payload as ChatMessagePayload
      if (state.byId[payload.message.id]) return
      useFeed.setState({
        ids: [...state.ids, payload.message.id],
        byId: { ...state.byId, [payload.message.id]: payload.message },
      })
      return
    }
    case 'chat.delta': {
      const payload = message.payload as ChatDeltaPayload
      bufferDelta(payload.messageId, 'content', payload.content)
      return
    }
    case 'chat.thinking': {
      const payload = message.payload as ChatDeltaPayload
      bufferDelta(payload.messageId, 'thinking', payload.content)
      return
    }
    case 'chat.message_updated': {
      const payload = message.payload as ChatMessageUpdatedPayload
      flushDeltas()
      const { byId } = useFeed.getState()
      const current = byId[payload.messageId]
      if (!current) return
      useFeed.setState({ byId: { ...byId, [payload.messageId]: { ...current, ...payload.updates } as Message } })
      return
    }
    default:
  }
}
