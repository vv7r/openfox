import { create } from 'zustand'
import type { GitDiffFile, GitStatusPayload } from '@shared/protocol.js'
import { getJson } from '../api'
import { currentRoute } from '../router'
import { useApp } from './app'

export type TabKind = 'file' | 'diff'

export interface Tab {
  key: string
  kind: TabKind
  path: string
}

export interface TreeEntry {
  name: string
  path: string
  type: 'file' | 'directory'
}

export type FileBody =
  | { path: string; content: string }
  | { path: string; original: string; modified: string }
  | { path: string; binary: true }
  | { path: string; tooLarge: true }

export type TabContent = { status: 'loading' } | { status: 'error' } | { status: 'ready'; body: FileBody }

export interface WorkspaceState {
  tabs: Tab[]
  /** Null shows the list of changed files. */
  activeKey: string | null
  contents: Record<string, TabContent>
  tree: Record<string, TreeEntry[]>
  expanded: Record<string, boolean>
}

const EMPTY: WorkspaceState = { tabs: [], activeKey: null, contents: {}, tree: {}, expanded: {} }

export const useWorkspace = create<WorkspaceState>(() => EMPTY)

// Bumped on every session change, so a late response cannot land in the next session.
let epoch = 0
const lastSeen = new Map<string, string>()

function workspaceUrl(route: 'tree' | 'file' | 'diff', path: string): string | null {
  const { sessionId } = currentRoute()
  if (!sessionId) return null
  return `/api/sessions/${sessionId}/workspace/${route}?path=${encodeURIComponent(path)}`
}

export function resetWorkspace(): void {
  epoch++
  lastSeen.clear()
  useWorkspace.setState(EMPTY)
}

export async function loadTree(dir: string): Promise<void> {
  const url = workspaceUrl('tree', dir)
  if (!url) return
  const started = epoch
  try {
    const { entries } = await getJson<{ entries: TreeEntry[] }>(url)
    if (started === epoch) useWorkspace.setState((s) => ({ tree: { ...s.tree, [dir]: entries } }))
  } catch {
    // The directory stays collapsed-looking: an unreadable folder has nothing to show
  }
}

export function toggleDir(dir: string): void {
  const { expanded, tree } = useWorkspace.getState()
  const open = !expanded[dir]
  useWorkspace.setState({ expanded: { ...expanded, [dir]: open } })
  if (open && !tree[dir]) void loadTree(dir)
}

async function loadTab(tab: Tab): Promise<void> {
  const url = workspaceUrl(tab.kind, tab.path)
  if (!url) return
  const started = epoch
  let content: TabContent
  try {
    content = { status: 'ready', body: await getJson<FileBody>(url) }
  } catch {
    content = { status: 'error' }
  }
  if (started !== epoch) return
  useWorkspace.setState((s) =>
    s.tabs.some((t) => t.key === tab.key) ? { contents: { ...s.contents, [tab.key]: content } } : s,
  )
}

export function openTab(kind: TabKind, path: string): void {
  const key = `${kind}:${path}`
  const state = useWorkspace.getState()
  useApp.setState({ mobilePane: 'workspace' })
  if (state.tabs.some((tab) => tab.key === key)) {
    useWorkspace.setState({ activeKey: key })
    return
  }
  const tab = { key, kind, path }
  useWorkspace.setState({
    tabs: [...state.tabs, tab],
    activeKey: key,
    contents: { ...state.contents, [key]: { status: 'loading' } },
  })
  void loadTab(tab)
}

export function selectTab(key: string | null): void {
  useWorkspace.setState({ activeKey: key })
}

export function closeTab(key: string): void {
  const { tabs, activeKey, contents } = useWorkspace.getState()
  const index = tabs.findIndex((tab) => tab.key === key)
  if (index === -1) return
  const remaining = tabs.filter((tab) => tab.key !== key)
  const { [key]: _closed, ...rest } = contents
  useWorkspace.setState({
    tabs: remaining,
    contents: rest,
    activeKey: activeKey === key ? ((remaining[index] ?? remaining[index - 1])?.key ?? null) : activeKey,
  })
}

const signature = (file: GitDiffFile | undefined): string =>
  file ? `${file.status}:${file.additions}:${file.deletions}` : ''

/** Reloads open tabs whose file changed, so the view follows what the agent writes. */
export function refreshChangedTabs(git: GitStatusPayload): void {
  const byPath = new Map(git.diff.files.map((file) => [file.path, file]))
  for (const tab of useWorkspace.getState().tabs) {
    const seen = signature(byPath.get(tab.path))
    if (lastSeen.has(tab.path) && lastSeen.get(tab.path) !== seen) void loadTab(tab)
    lastSeen.set(tab.path, seen)
  }
}
