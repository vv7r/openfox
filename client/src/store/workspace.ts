import { create } from 'zustand'
import type { GitDiffFile, GitStatusPayload } from '@shared/protocol.js'
import { getJson, sendJson } from '../api'
import { t } from '../i18n'
import { currentRoute } from '../router'
import { useApp } from './app'

export type TabKind = 'file' | 'diff'

/** Permanent tabs of the right panel, next to the files. */
export const CONTEXT_VIEW = 'view:context'
export const CRITERIA_VIEW = 'view:criteria'

export interface Tab {
  key: string
  kind: TabKind
  path: string
  /** API prefix the tab was opened under; a draft must be saved where it came from. */
  root: string
}

export interface TreeEntry {
  name: string
  path: string
  type: 'file' | 'directory'
}

export type FileBody =
  | { path: string; content: string; hash: string; editable: boolean }
  | { path: string; original: string; modified: string }
  | { path: string; binary: true }
  | { path: string; tooLarge: true }

export type TabContent = { status: 'loading' } | { status: 'error' } | { status: 'ready'; body: FileBody }

export type SaveState = 'saving' | 'conflict' | 'error'

export interface WorkspaceState {
  tabs: Tab[]
  /** Top row of the panel: context, criteria, or null for the files. */
  view: string | null
  /** Open file shown in the files view; null shows the project tree. */
  activeKey: string | null
  contents: Record<string, TabContent>
  tree: Record<string, TreeEntry[]>
  expanded: Record<string, boolean>
  /** Tabs whose editor holds edits that are not on disk. */
  dirty: Record<string, true>
  saves: Record<string, SaveState>
}

const EMPTY: WorkspaceState = {
  tabs: [],
  view: null,
  activeKey: null,
  contents: {},
  tree: {},
  expanded: {},
  dirty: {},
  saves: {},
}

export const useWorkspace = create<WorkspaceState>(() => EMPTY)

// Bumped on every session change, so a late response cannot land in the next session.
let epoch = 0
const lastSeen = new Map<string, string>()
let treeSignature: string | null = null
const draftReaders = new Map<string, () => string>()
const disposeListeners = new Set<(key: string) => void>()

function workspaceRoot(): string | null {
  const { sessionId, projectId } = currentRoute()
  if (sessionId) return `/api/sessions/${sessionId}/workspace`
  return projectId ? `/api/projects/${projectId}/workspace` : null
}

const fileUrl = (root: string, route: string, path: string): string =>
  `${root}/${route}?path=${encodeURIComponent(path)}`

/** Lets the editor release what it keeps for a tab, without the store depending on it. */
export function onTabDisposed(listener: (key: string) => void): () => void {
  disposeListeners.add(listener)
  return () => disposeListeners.delete(listener)
}

function without<T>(record: Record<string, T>, key: string): Record<string, T> {
  const { [key]: _removed, ...rest } = record
  return rest
}

export function resetWorkspace(): void {
  epoch++
  lastSeen.clear()
  treeSignature = null
  draftReaders.clear()
  const { tabs, view } = useWorkspace.getState()
  tabs.forEach((tab) => disposeListeners.forEach((listener) => listener(tab.key)))
  useWorkspace.setState({ ...EMPTY, view })
}

async function putFile(root: string, path: string, content: string, baseHash?: string) {
  return sendJson(fileUrl(root, 'file', path), 'PUT', baseHash === undefined ? { content } : { content, baseHash })
}

function textBody(key: string) {
  const content = useWorkspace.getState().contents[key]
  return content?.status === 'ready' && 'content' in content.body ? content.body : null
}

/** Switching session or project closes the tabs: unsaved edits must not vanish silently. */
export function leaveWorkspace(): void {
  const { tabs, dirty } = useWorkspace.getState()
  const drafts = tabs.flatMap((tab) => {
    const read = dirty[tab.key] ? draftReaders.get(tab.key) : undefined
    return read ? [{ tab, text: read(), hash: textBody(tab.key)?.hash }] : []
  })
  const keep =
    drafts.length > 0 &&
    window.confirm(
      t({
        en: `Save your changes to ${drafts.map((draft) => draft.tab.path).join(', ')}? Cancel discards them.`,
        fr: `Enregistrer vos modifications de ${drafts.map((draft) => draft.tab.path).join(', ')} ? Annuler les abandonne.`,
      }),
    )
  if (keep) {
    for (const { tab, text, hash } of drafts) {
      void putFile(tab.root, tab.path, text, hash).then((response) => {
        if (response.ok) return
        window.alert(t({ en: `Could not save ${tab.path}`, fr: `Impossible d’enregistrer ${tab.path}` }))
      })
    }
  }
  resetWorkspace()
}

export async function loadTree(dir: string): Promise<void> {
  const root = workspaceRoot()
  if (!root) return
  const started = epoch
  try {
    const { entries } = await getJson<{ entries: TreeEntry[] }>(fileUrl(root, 'tree', dir))
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

export function refreshTree(): void {
  Object.keys(useWorkspace.getState().tree).forEach((dir) => void loadTree(dir))
}

async function loadTab(tab: Tab): Promise<void> {
  const started = epoch
  let content: TabContent
  try {
    content = { status: 'ready', body: await getJson<FileBody>(fileUrl(tab.root, tab.kind, tab.path)) }
  } catch {
    content = { status: 'error' }
  }
  if (started !== epoch) return
  // A tab with unsaved edits keeps its base version, so saving detects the conflict
  useWorkspace.setState((s) =>
    s.tabs.some((other) => other.key === tab.key) && !s.dirty[tab.key]
      ? { contents: { ...s.contents, [tab.key]: content } }
      : s,
  )
}

/** Null marks the tab clean; otherwise `read` gives the text of the unsaved edits. */
export function setDirty(key: string, read: (() => string) | null): void {
  if (read) draftReaders.set(key, read)
  else draftReaders.delete(key)
  useWorkspace.setState((s) => {
    if ((s.dirty[key] === true) === (read !== null)) return s
    return { dirty: read ? { ...s.dirty, [key]: true } : without(s.dirty, key) }
  })
}

/** Writes `text`; true once it is on disk. `force` replaces whatever changed there since. */
export async function saveFile(key: string, text: string, force = false): Promise<boolean> {
  const tab = useWorkspace.getState().tabs.find((other) => other.key === key)
  const body = textBody(key)
  if (!tab || !body) return false
  const finish = (save: SaveState | null) =>
    useWorkspace.setState((s) => ({ saves: save ? { ...s.saves, [key]: save } : without(s.saves, key) }))

  finish('saving')
  const started = epoch
  let response: Response
  try {
    response = await putFile(tab.root, tab.path, text, force ? undefined : body.hash)
  } catch {
    finish('error')
    return false
  }
  if (started !== epoch) return false
  if (!response.ok) {
    finish(response.status === 409 ? 'conflict' : 'error')
    return false
  }
  const { hash } = (await response.json()) as { hash: string }
  finish(null)
  useWorkspace.setState((s) => ({
    contents: { ...s.contents, [key]: { status: 'ready', body: { ...body, content: text, hash } } },
  }))
  return true
}

/** Discards the unsaved edits; the text now on disk, or null if it cannot be read. */
export async function reloadFile(key: string): Promise<string | null> {
  const tab = useWorkspace.getState().tabs.find((other) => other.key === key)
  if (!tab) return null
  setDirty(key, null)
  useWorkspace.setState((s) => ({ saves: without(s.saves, key) }))
  await loadTab(tab)
  return textBody(key)?.content ?? null
}

export function openTab(kind: TabKind, path: string): void {
  const key = `${kind}:${path}`
  const state = useWorkspace.getState()
  useApp.setState({ mobilePane: 'workspace' })
  if (state.tabs.some((tab) => tab.key === key)) {
    useWorkspace.setState({ activeKey: key, view: null })
    return
  }
  const root = workspaceRoot()
  if (!root) return
  const tab = { key, kind, path, root }
  useWorkspace.setState({
    tabs: [...state.tabs, tab],
    activeKey: key,
    view: null,
    contents: { ...state.contents, [key]: { status: 'loading' } },
  })
  void loadTab(tab)
}

export function selectView(view: string | null): void {
  useWorkspace.setState({ view })
}

export function selectTab(key: string | null): void {
  useWorkspace.setState({ activeKey: key })
}

export function closeTab(key: string): void {
  const { tabs, activeKey, contents, dirty, saves } = useWorkspace.getState()
  const index = tabs.findIndex((tab) => tab.key === key)
  if (index === -1) return
  const remaining = tabs.filter((tab) => tab.key !== key)
  draftReaders.delete(key)
  disposeListeners.forEach((listener) => listener(key))
  useWorkspace.setState({
    tabs: remaining,
    contents: without(contents, key),
    dirty: without(dirty, key),
    saves: without(saves, key),
    activeKey: activeKey === key ? ((remaining[index] ?? remaining[index - 1])?.key ?? null) : activeKey,
  })
}

/** Git cannot tell when an untracked file is rewritten: what the agent wrote is reloaded directly. */
export function refreshAfterAgentWrite(): void {
  useWorkspace.getState().tabs.forEach((tab) => void loadTab(tab))
  refreshTree()
}

const signature = (file: GitDiffFile | undefined): string =>
  file ? `${file.status}:${file.additions}:${file.deletions}` : ''

/** Reloads open tabs whose file changed, so the view follows what the agent writes. */
export function refreshChangedTabs(git: GitStatusPayload): void {
  const tree = git.diff.files
    .map((file) => `${file.path}:${file.status}`)
    .sort()
    .join('|')
  if (treeSignature !== null && treeSignature !== tree) refreshTree()
  treeSignature = tree

  const byPath = new Map(git.diff.files.map((file) => [file.path, file]))
  for (const tab of useWorkspace.getState().tabs) {
    const seen = signature(byPath.get(tab.path))
    if (lastSeen.has(tab.path) && lastSeen.get(tab.path) !== seen) void loadTab(tab)
    lastSeen.set(tab.path, seen)
  }
}
