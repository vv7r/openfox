import { useMemo } from 'react'
import type { Message } from '@shared/types.js'
import { useApp } from '../store/app'
import { useFeed, type FeedState } from '../store/feed'

const WRITE_TOOLS: ReadonlySet<string> = new Set(['write_file', 'edit_file'])
const STREAMED_PATH = /"path"\s*:\s*("(?:[^"\\]|\\.)*")/

function relativeTo(root: string, path: string): string {
  const base = root.endsWith('/') ? root : `${root}/`
  if (path.startsWith(base)) return path.slice(base.length)
  return path.replace(/^(\.\/)+/, '')
}

function streamedPath(args: string | undefined): string | null {
  const found = args === undefined ? undefined : STREAMED_PATH.exec(args)?.[1]
  return found === undefined ? null : (JSON.parse(found) as string)
}

function pathsOf(message: Message): string[] {
  const done = (message.toolCalls ?? [])
    .filter((call) => WRITE_TOOLS.has(call.name) && typeof call.arguments['path'] === 'string')
    .map((call) => call.arguments['path'] as string)
  const streaming = (message.preparingToolCalls ?? [])
    .filter((call) => WRITE_TOOLS.has(call.name))
    .flatMap((call) => streamedPath(call.arguments) ?? [])
  return [...done, ...streaming]
}

/** Whether a finished call wrote a file. The result event itself does not name its tool. */
export function isWriteCall(feed: Pick<FeedState, 'byId'>, messageId: string, callId: string): boolean {
  const call = feed.byId[messageId]?.toolCalls?.find((candidate) => candidate.id === callId)
  return call !== undefined && WRITE_TOOLS.has(call.name)
}

/** Files the agent has been writing since the user last spoke, sorted and relative to `root`. */
export function agentFiles(feed: Pick<FeedState, 'ids' | 'byId'>, root: string): string[] {
  const paths = new Set<string>()
  for (let index = feed.ids.length - 1; index >= 0; index--) {
    const message = feed.byId[feed.ids[index]!]
    if (!message) continue
    if (message.role === 'user' && !message.isSystemGenerated) break
    pathsOf(message).forEach((path) => paths.add(relativeTo(root, path)))
  }
  return [...paths].sort()
}

const SEPARATOR = '\n'

/** The files locked for the user while the agent runs. Re-renders only when the list changes. */
export function useAgentFiles(): ReadonlySet<string> {
  const root = useApp((state) => (state.session?.isRunning ? (state.session.workspace ?? state.session.workdir) : null))
  const list = useFeed((state) => (root === null ? '' : agentFiles(state, root).join(SEPARATOR)))
  return useMemo(() => new Set(list ? list.split(SEPARATOR) : []), [list])
}
