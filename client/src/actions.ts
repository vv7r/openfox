import type {
  Attachment,
  DangerLevel,
  MetadataEntry,
  Session,
  WorkflowExecution,
  WorkflowLaunchScope,
} from '@shared/types.js'
import { authFetch, getJson, sendJson } from './api'
import { reloadProjects, reloadSessions, sendOverSocket } from './controller'
import {
  effectiveEffort,
  effortModelRef,
  modelDefaultEffort,
  overrideEffort,
  shouldGateEffort,
} from './feed/effortGate'
import { fillTemplate, templateParams } from './feed/launch'
import { navigate } from './router'
import { setHistory } from './store/feed'
import { useApp } from './store/app'

const openSessionId = (): string | null => useApp.getState().session?.id ?? null

function sessionUrl(path: string): string | null {
  const id = openSessionId()
  return id ? `/api/sessions/${id}/${path}` : null
}

async function put(path: string, body: unknown): Promise<void> {
  const url = sessionUrl(path)
  if (url) await sendJson(url, 'PUT', body)
}

async function post(path: string, body: unknown = {}): Promise<Response | null> {
  const url = sessionUrl(path)
  return url ? sendJson(url, 'POST', body) : null
}

interface SessionUpdate {
  session?: Session
  messages?: Parameters<typeof setHistory>[1]
  hiddenCount?: number
  error?: string
}

/** Applies the server's answer directly, so the UI does not depend on the socket event. */
async function putAndApply(path: string, body: unknown): Promise<void> {
  const url = sessionUrl(path)
  if (!url) return
  const response = await sendJson(url, 'PUT', body)
  const data = (await response.json().catch(() => ({}))) as SessionUpdate
  if (!response.ok) {
    useApp.setState({ chatError: data.error ?? `${path} failed (${response.status})` })
    return
  }
  if (data.session) useApp.setState({ session: data.session })
  if (data.session && data.messages) setHistory(data.session.id, data.messages, data.hiddenCount ?? 0)
}

const askEffortGate = (from: string | undefined, to: string, label?: string): Promise<boolean> =>
  new Promise((resolve) => {
    useApp.setState({
      appDialog: {
        kind: 'effort-gate',
        from,
        to,
        label,
        resolve: (keep) => {
          useApp.setState({ appDialog: null })
          resolve(keep)
        },
      },
    })
  })

function currentModelDefault(agentOverride: string | undefined): string | undefined {
  const { session, providers, model } = useApp.getState()
  const target = effortModelRef(session, agentOverride)
  const provider = providers.find((item) => item.id === target.providerId) ?? providers.find((item) => item.isActive)
  return modelDefaultEffort(provider?.models.find((item) => item.id === (target.model ?? model)))
}

function applySession(data: {
  session?: Session
  messages?: Parameters<typeof setHistory>[1]
  hiddenCount?: number
}): void {
  if (!data.session) return
  useApp.setState({ session: data.session })
  if (data.messages) setHistory(data.session.id, data.messages, data.hiddenCount ?? 0)
}

export async function pinEffort(effort: string): Promise<void> {
  const response = await post('pin-effort', { effort })
  if (response?.ok) applySession((await response.json()) as SessionUpdate)
}

export async function clearEffortPin(): Promise<void> {
  const url = sessionUrl('pin-effort')
  if (!url) return
  const response = await authFetch(url, { method: 'DELETE' })
  if (response.ok) applySession((await response.json()) as SessionUpdate)
}

export const setNightMode = (nightMode: boolean) => putAndApply('night-mode', { nightMode })

/** Fills the LLM cache on the first keystroke of an empty session. */
export function warmCache(): void {
  void post('warmup').catch(() => {})
}

async function loadAgentOverrides(): Promise<Record<string, string>> {
  const workdir = useApp.getState().session?.workdir
  if (!workdir) return {}
  const data = await getJson<{ modelOverrides?: Record<string, string> }>(
    `/api/agents?workdir=${encodeURIComponent(workdir)}`,
  )
  return data.modelOverrides ?? {}
}

/** On a warm cache an agent with another effort needs a choice first. */
export async function switchMode(mode: string, label?: string): Promise<void> {
  const { session, context } = useApp.getState()
  const overrides = await loadAgentOverrides().catch((): Record<string, string> => ({}))
  const activeOverride = overrides[session?.mode ?? '']
  const current = effectiveEffort(session, overrideEffort(activeOverride), currentModelDefault(activeOverride))
  const next =
    overrideEffort(overrides[mode]) ?? effectiveEffort(session, undefined, currentModelDefault(overrides[mode]))
  if (next && shouldGateEffort(context?.warmCache, current, next)) {
    if (await askEffortGate(current, next, label)) await pinEffort(current!)
    else await clearEffortPin()
  }
  await putAndApply('mode', { mode })
}

export const setDangerLevel = (dangerLevel: DangerLevel) => putAndApply('danger-level', { dangerLevel })
export const stopGeneration = () => post('stop')
export const continueGeneration = () => post('continue')
export const confirmPath = (callId: string, approved: boolean, alwaysAllow = false) =>
  post('confirm-path', { callId, approved, alwaysAllow })

export async function answerQuestion(callId: string, answer: string, skip = false): Promise<void> {
  await post('answer', { callId, answer, skip })
  useApp.setState((state) => ({ questions: state.questions.filter((q) => q.callId !== callId) }))
}

export function saveCriteria(entries: MetadataEntry[]): void {
  const state = useApp.getState()
  if (!state.session) return
  useApp.setState({
    session: { ...state.session, metadataEntries: { ...state.session.metadataEntries, criteria: entries } },
  })
  void put('criteria', { criteria: entries })
}

interface ProviderResponse {
  session: Session
  messages?: Parameters<typeof setHistory>[1]
}

/** Applies a provider change; the server answers with the session, possibly reshaped. */
/** An effort picked on a warm cache can be declined, which keeps the current one. */
export async function selectEffort(providerId: string, model: string, effort: string): Promise<void> {
  const { session, context } = useApp.getState()
  const overrides = await loadAgentOverrides().catch((): Record<string, string> => ({}))
  const activeOverride = overrides[session?.mode ?? '']
  const current = effectiveEffort(session, overrideEffort(activeOverride), currentModelDefault(activeOverride))
  if (shouldGateEffort(context?.warmCache, current, effort) && (await askEffortGate(current, effort))) return
  if (session?.providerPinnedEffort) await clearEffortPin()
  await selectModel(providerId, model, effort)
}

export async function selectModel(providerId: string, model: string, reasoningEffort?: string): Promise<void> {
  const response = await post('provider', { providerId, model, ...(reasoningEffort ? { reasoningEffort } : {}) })
  if (!response?.ok) return
  const data = (await response.json()) as ProviderResponse
  useApp.setState({ session: data.session })
  if (data.messages) setHistory(data.session.id, data.messages)
}

export async function resetModel(): Promise<void> {
  const url = sessionUrl('provider')
  if (!url) return
  const response = await authFetch(url, { method: 'DELETE' })
  if (response.ok) useApp.setState({ session: ((await response.json()) as ProviderResponse).session })
}

export interface OutgoingMessage {
  content?: string
  attachments?: Attachment[]
  messageKind?: string
}

export async function sendMessage(content: string | OutgoingMessage): Promise<void> {
  const response = await post('message', typeof content === 'string' ? { content } : content)
  const data = (await response?.json()) as { queueState?: ReturnType<typeof useApp.getState>['queue'] } | undefined
  if (data?.queueState) useApp.setState({ queue: data.queueState })
}

export const pauseGeneration = () => post('pause')
export const resumeGeneration = () => post('resume')

export async function cancelQueued(queueId: string): Promise<void> {
  const url = sessionUrl(`queue/${queueId}`)
  if (url) await authFetch(url, { method: 'DELETE' })
}

export const replayMessage = (messageId: string, content?: string) =>
  post('replay', { messageId, ...(content === undefined ? {} : { content }) })

export async function forkAt(messageId: string): Promise<void> {
  const response = await post('fork', { messageId })
  if (!response?.ok) return
  const { session } = (await response.json()) as { session: Session }
  navigate(`/p/${session.projectId}/s/${session.id}`)
}

const withSession = (payload: Record<string, unknown>) => ({ sessionId: openSessionId(), ...payload })

export function launchWorkflow(
  workflowId: string,
  params?: Record<string, string>,
  options: { scope?: WorkflowLaunchScope; subGroup?: string } = {},
): void {
  sendOverSocket(
    'runner.launch',
    withSession({
      workflowId,
      scope: options.scope ?? 'auto',
      ...(params ? { params } : {}),
      ...(options.subGroup ? { subGroup: options.subGroup } : {}),
    }),
  )
}

export function continueWorkflow(execution: WorkflowExecution, userChoice?: string): void {
  sendOverSocket(
    'runner.launch',
    withSession({
      workflowId: execution.workflowId,
      resumeFrom: execution.currentStepId,
      stepOutput: execution.stepOutput,
      ...(Object.keys(execution.params).length > 0 ? { params: execution.params } : {}),
      ...(execution.subGroup ? { subGroup: execution.subGroup } : {}),
      ...(userChoice ? { userChoice } : {}),
    }),
  )
}

export const exitWorkflow = () => sendOverSocket('workflow.exit', withSession({}))

/** Skips the rest of the backoff wait; the server retries immediately. */
export function retryLlmNow(): void {
  sendOverSocket('chat.llm_retry_now', withSession({}))
  useApp.setState({ llmRetry: null })
}

/** A blocked workflow step resumes through its runner, a plain chat re-runs the last turn. */
export function retryAfterFailure(): void {
  const { execution, session } = useApp.getState()
  useApp.setState({ llmRetry: null, chatError: null })
  if (execution?.status === 'blocked' && execution.currentStepId && !session?.isRunning) {
    continueWorkflow(execution)
    return
  }
  sendOverSocket('chat.retry', withSession({}))
}

export async function loadCommand(
  commandId: string,
  workdir: string,
): Promise<{ prompt: string; agentMode: string | undefined }> {
  const full = await getJson<{ prompt: string; metadata: { agentMode?: string } }>(
    `/api/commands/${encodeURIComponent(commandId)}?workdir=${encodeURIComponent(workdir)}`,
  )
  return { prompt: full.prompt, agentMode: full.metadata.agentMode }
}

export async function sendCommand(
  content: string,
  agentMode: string | undefined,
  attachments: Attachment[] = [],
): Promise<void> {
  if (agentMode && agentMode !== useApp.getState().session?.mode) await switchMode(agentMode)
  await sendMessage({ content, messageKind: 'command', ...(attachments.length ? { attachments } : {}) })
}

/** Runs a slash command: its prompt, with {{params}} filled from positional arguments. */
export async function runCommand(commandId: string, args: string[], workdir: string): Promise<void> {
  const { prompt, agentMode } = await loadCommand(commandId, workdir)
  const values = Object.fromEntries(
    templateParams(prompt).flatMap((name, index) => (args[index] === undefined ? [] : [[name, args[index]]])),
  )
  await sendCommand(fillTemplate(prompt, values), agentMode)
}

export async function renameSession(sessionId: string, title: string): Promise<void> {
  await sendJson(`/api/sessions/${sessionId}/title`, 'PUT', { title })
  await reloadSessions()
}

export async function toggleFavorite(sessionId: string, isFavorite: boolean): Promise<void> {
  await sendJson(`/api/sessions/${sessionId}/favorite`, 'PUT', { isFavorite })
  await reloadSessions()
}

export async function deleteSession(sessionId: string, projectId: string): Promise<void> {
  await authFetch(`/api/sessions/${sessionId}`, { method: 'DELETE' })
  if (openSessionId() === sessionId) navigate(`/p/${projectId}`)
  await reloadSessions()
}

export async function exportSession(sessionId: string, title: string): Promise<void> {
  const response = await authFetch(`/api/sessions/${sessionId}/export`)
  if (!response.ok) return
  const url = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = url
  link.download = `${title.replace(/[^\w.-]+/g, '-') || 'session'}.json`
  link.click()
  URL.revokeObjectURL(url)
}

export async function importSession(projectId: string, file: File): Promise<boolean> {
  try {
    const payload = JSON.parse(await file.text()) as unknown
    const response = await sendJson('/api/sessions/import', 'POST', { projectId, payload })
    if (!response.ok) return false
    const { session } = (await response.json()) as { session: Session }
    navigate(`/p/${projectId}/s/${session.id}`)
    return true
  } catch {
    return false
  }
}

export async function deleteAllSessions(projectId: string): Promise<void> {
  await authFetch(`/api/projects/${projectId}/sessions`, { method: 'DELETE' })
  if (useApp.getState().session?.projectId === projectId) navigate(`/p/${projectId}`)
  await reloadSessions()
}

/** Resolves with the reason it failed, or null once the project is gone. */
export async function deleteProject(projectId: string, deleteFiles: boolean): Promise<string | null> {
  const response = await authFetch(`/api/projects/${projectId}${deleteFiles ? '?deleteFiles=true' : ''}`, {
    method: 'DELETE',
  })
  if (!response.ok) return ((await response.json()) as { error?: string }).error ?? 'error'
  await reloadProjects()
  if (location.pathname.startsWith(`/p/${projectId}`)) navigate('/')
  return null
}

export async function toggleProjectStar(projectId: string, isStarred: boolean): Promise<void> {
  await sendJson(`/api/projects/${projectId}/star`, 'PUT', { isStarred })
  await reloadProjects()
}

/** Opens the system file manager on the machine running the server. */
export const openProjectFolder = (projectId: string) =>
  authFetch(`/api/projects/${projectId}/open-folder`).catch(() => {})

export async function openProject(name: string, workdir: string): Promise<string | null> {
  const response = await sendJson('/api/projects', 'POST', { name, workdir })
  if (!response.ok) {
    const data = (await response.json()) as { error?: string; code?: string; path?: string }
    if (data.code === 'EACCES') {
      useApp.setState({
        appDialog: { kind: 'permissions', path: data.path ?? workdir, retry: () => void openProject(name, workdir) },
      })
      return null
    }
    return data.error ?? 'error'
  }
  const { project } = (await response.json()) as { project: { id: string } }
  await reloadProjects()
  navigate(`/p/${project.id}`)
  return null
}
