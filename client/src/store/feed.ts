import { create } from 'zustand'
import type {
  ChatDeltaPayload,
  ChatDonePayload,
  ChatMessagePayload,
  ChatMessageUpdatedPayload,
  ChatToolCallPayload,
  ChatToolOutputPayload,
  ChatToolPreparingPayload,
  ChatToolResultPayload,
  ServerMessage,
  SessionStatePayload,
} from '@shared/protocol.js'
import type { Message, ToolCall } from '@shared/types.js'
import {
  bufferDelta,
  bufferToolOutput,
  clearDeltas,
  flushDeltas,
  setDeltaFlush,
  type PendingDelta,
  type ToolChunk,
} from './deltaBuffer'

export interface FeedState {
  sessionId: string | null
  ids: string[]
  byId: Record<string, Message>
  hiddenCount: number
}

export const useFeed = create<FeedState>(() => ({ sessionId: null, ids: [], byId: {}, hiddenCount: 0 }))

const MAX_STREAMED_OUTPUT_CHARS = 256_000

let maxFeedItems = 0

/** 0 keeps everything; a positive value drops the oldest items of the open feed. */
export function setMaxFeedItems(limit: number): void {
  maxFeedItems = Number.isFinite(limit) && limit > 0 ? limit : 0
}

/** The current run locks the files it wrote, and a streaming message still receives deltas. */
function firstProtected({ ids, byId }: Pick<FeedState, 'ids' | 'byId'>): number {
  let first = ids.length
  let runStartFound = false
  for (let index = ids.length - 1; index >= 0; index--) {
    const message = byId[ids[index]!]
    if (message?.isStreaming) first = index
    if (!runStartFound && message?.role === 'user' && !message.isSystemGenerated) {
      first = Math.min(first, index)
      runStartFound = true
    }
  }
  return first
}

function trimmed(
  state: Pick<FeedState, 'ids' | 'byId' | 'hiddenCount'>,
): Pick<FeedState, 'ids' | 'byId' | 'hiddenCount'> {
  if (maxFeedItems === 0 || state.ids.length <= maxFeedItems) return state
  const cut = Math.min(state.ids.length - maxFeedItems, firstProtected(state))
  if (cut === 0) return state
  const byId = { ...state.byId }
  state.ids.slice(0, cut).forEach((id) => delete byId[id])
  return { ids: state.ids.slice(cut), byId, hiddenCount: state.hiddenCount + cut }
}

/** Empties the feed for a session whose history is still loading. */
export function resetFeed(sessionId: string | null): void {
  clearDeltas()
  useFeed.setState({ sessionId, ids: [], byId: {}, hiddenCount: 0 })
}

export function setHistory(
  sessionId: string,
  messages: Message[],
  hiddenCount = 0,
  options: { keepAll?: boolean } = {},
): void {
  const history = {
    ids: messages.map((message) => message.id),
    byId: Object.fromEntries(messages.map((message) => [message.id, message])),
    hiddenCount,
  }
  useFeed.setState({ sessionId, ...(options.keepAll ? history : trimmed(history)) })
}

function appendOutput(toolCall: ToolCall, chunks: ToolChunk[]): ToolCall {
  const output = [...(toolCall.streamingOutput ?? [])]
  for (const { stream, content } of chunks) {
    const last = output[output.length - 1]
    if (last?.stream === stream) output[output.length - 1] = { ...last, content: last.content + content }
    else output.push({ stream, content, timestamp: Date.now() })
  }
  let total = output.reduce((sum, chunk) => sum + chunk.content.length, 0)
  while (total > MAX_STREAMED_OUTPUT_CHARS && output.length > 0) {
    const excess = total - MAX_STREAMED_OUTPUT_CHARS
    const first = output[0]!
    if (first.content.length <= excess) {
      output.shift()
      total -= first.content.length
    } else {
      output[0] = { ...first, content: first.content.slice(excess) }
      total -= excess
    }
  }
  return { ...toolCall, streamingOutput: output }
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
      delta.tools.forEach((chunk) => bufferToolOutput(id, chunk))
      continue
    }
    let toolCalls = message.toolCalls
    for (const callId of new Set(delta.tools.map((chunk) => chunk.callId))) {
      const chunks = delta.tools.filter((chunk) => chunk.callId === callId)
      if (toolCalls?.some((call) => call.id === callId)) {
        toolCalls = toolCalls.map((call) => (call.id === callId ? appendOutput(call, chunks) : call))
      } else {
        chunks.forEach((chunk) => bufferToolOutput(id, chunk))
      }
    }
    next[id] = {
      ...message,
      content: message.content + delta.content,
      ...(delta.thinking ? { thinkingContent: (message.thinkingContent ?? '') + delta.thinking } : {}),
      ...(toolCalls ? { toolCalls } : {}),
    }
  }
  useFeed.setState({ byId: next })
}

setDeltaFlush(applyDeltas)

function updateMessage(id: string, update: (message: Message) => Message): void {
  const { byId } = useFeed.getState()
  const current = byId[id]
  if (current) useFeed.setState({ byId: { ...byId, [id]: update(current) } })
}

/** Omits a key entirely: exact optional properties reject an explicit undefined. */
function without<T extends object, K extends keyof T>(value: T, key: K): Omit<T, K> {
  const { [key]: _dropped, ...rest } = value
  return rest
}

/** A snapshot can trail the deltas already applied: never show less text than the live copy. */
function keepLongest(snapshot: Message, live: Message | undefined): Message {
  if (!live) return snapshot
  const content = live.content.length > snapshot.content.length ? live.content : snapshot.content
  const thinking =
    (live.thinkingContent?.length ?? 0) > (snapshot.thinkingContent?.length ?? 0)
      ? live.thinkingContent
      : snapshot.thinkingContent
  return { ...snapshot, content, ...(thinking === undefined ? {} : { thinkingContent: thinking }) }
}

function applyToolPreparing(message: Message, payload: ChatToolPreparingPayload): Message {
  if (message.toolCalls?.[payload.index]) return message
  const existing = message.preparingToolCalls ?? []
  const editContext = payload.editContext?.length ? { editContext: payload.editContext } : {}
  const args = payload.arguments === undefined ? {} : { arguments: payload.arguments }
  const preparingToolCalls = existing.some((call) => call.index === payload.index)
    ? existing.map((call) => (call.index === payload.index ? { ...call, ...args, ...editContext } : call))
    : [...existing, { index: payload.index, name: payload.name, ...args, ...editContext }]
  return { ...message, preparingToolCalls }
}

function applyToolCall(message: Message, payload: ChatToolCallPayload): Message {
  const index = message.toolCalls?.length ?? 0
  const preparing = message.preparingToolCalls?.filter((call) => call.index !== index)
  const base = without(message, 'preparingToolCalls')
  return {
    ...base,
    toolCalls: [
      ...(message.toolCalls ?? []),
      { id: payload.callId, name: payload.tool, arguments: payload.args, startedAt: Date.now() },
    ],
    ...(preparing?.length ? { preparingToolCalls: preparing } : {}),
  }
}

export function applyServerMessage(message: ServerMessage): void {
  const state = useFeed.getState()
  if (message.sessionId && message.sessionId !== state.sessionId) return

  switch (message.type) {
    case 'session.state': {
      const payload = message.payload as SessionStatePayload
      flushDeltas()
      const { byId } = useFeed.getState()
      setHistory(
        payload.session.id,
        payload.messages.map((m) => keepLongest(m, byId[m.id])),
        payload.hiddenCount ?? 0,
      )
      return
    }
    case 'chat.message': {
      const payload = message.payload as ChatMessagePayload
      if (state.byId[payload.message.id]) return
      useFeed.setState(
        trimmed({
          ids: [...state.ids, payload.message.id],
          byId: { ...state.byId, [payload.message.id]: payload.message },
          hiddenCount: state.hiddenCount,
        }),
      )
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
    case 'chat.tool_output': {
      const payload = message.payload as ChatToolOutputPayload
      bufferToolOutput(payload.messageId, { callId: payload.callId, stream: payload.stream, content: payload.output })
      return
    }
    case 'chat.tool_preparing': {
      const payload = message.payload as ChatToolPreparingPayload
      updateMessage(payload.messageId, (m) => applyToolPreparing(m, payload))
      return
    }
    case 'chat.tool_call': {
      const payload = message.payload as ChatToolCallPayload
      flushDeltas()
      updateMessage(payload.messageId, (m) => applyToolCall(m, payload))
      return
    }
    case 'chat.tool_result': {
      const payload = message.payload as ChatToolResultPayload
      flushDeltas()
      updateMessage(payload.messageId, (m) => ({
        ...m,
        // The final result supersedes the streamed view
        ...(m.toolCalls
          ? {
              toolCalls: m.toolCalls.map((c) =>
                c.id === payload.callId ? { ...without(c, 'streamingOutput'), result: payload.result } : c,
              ),
            }
          : {}),
      }))
      return
    }
    case 'chat.message_updated': {
      const payload = message.payload as ChatMessageUpdatedPayload
      flushDeltas()
      updateMessage(payload.messageId, (m) => {
        const merged = { ...m, ...payload.updates } as Message
        return m.content.length > merged.content.length ? { ...merged, content: m.content } : merged
      })
      return
    }
    case 'chat.done': {
      const payload = message.payload as ChatDonePayload
      flushDeltas()
      updateMessage(payload.messageId, (m) => ({
        ...without(m, 'preparingToolCalls'),
        isStreaming: false,
        completeReason: payload.reason,
        ...(payload.stats ? { stats: payload.stats as NonNullable<Message['stats']> } : {}),
      }))
      return
    }
    default:
  }
}
