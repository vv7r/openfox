import type { Attachment, DangerLevel, MetadataEntry, Session, WorkflowExecution } from '@shared/types.js'
import { authFetch, getJson, sendJson } from './api'
import { reloadProjects, reloadSessions, sendOverSocket } from './controller'
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

export const switchMode = (mode: string) => put('mode', { mode })
export const setDangerLevel = (dangerLevel: DangerLevel) => put('danger-level', { dangerLevel })
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
export async function selectModel(providerId: string, model: string): Promise<void> {
  const response = await post('provider', { providerId, model })
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

export function launchWorkflow(workflowId: string, params?: Record<string, string>): void {
  sendOverSocket('runner.launch', withSession({ workflowId, scope: 'auto', ...(params ? { params } : {}) }))
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
export const retryLastTurn = () => sendOverSocket('chat.retry', withSession({}))

/** Runs a slash command: its prompt, with {{params}} filled from positional arguments. */
export async function runCommand(commandId: string, args: string[], workdir: string): Promise<void> {
  const full = await getJson<{ prompt: string; metadata: { agentMode?: string } }>(
    `/api/commands/${encodeURIComponent(commandId)}?workdir=${encodeURIComponent(workdir)}`,
  )
  const names = [...new Set([...full.prompt.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]!))]
  const prompt = names.reduce(
    (text, name, index) => (args[index] === undefined ? text : text.replaceAll(`{{${name}}}`, args[index])),
    full.prompt,
  )
  if (full.metadata.agentMode && full.metadata.agentMode !== useApp.getState().session?.mode)
    await switchMode(full.metadata.agentMode)
  await sendMessage({ content: prompt, messageKind: 'command' })
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

export async function openProject(name: string, workdir: string): Promise<string | null> {
  const response = await sendJson('/api/projects', 'POST', { name, workdir })
  if (!response.ok) return ((await response.json()) as { error?: string }).error ?? 'error'
  const { project } = (await response.json()) as { project: { id: string } }
  await reloadProjects()
  navigate(`/p/${project.id}`)
  return null
}
