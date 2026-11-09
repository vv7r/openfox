import type { DangerLevel, MetadataEntry, Session } from '@shared/types.js'
import { authFetch, sendJson } from './api'
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

export async function sendMessage(content: string): Promise<void> {
  const response = await post('message', { content })
  const data = (await response?.json()) as { queueState?: ReturnType<typeof useApp.getState>['queue'] } | undefined
  if (data?.queueState) useApp.setState({ queue: data.queueState })
}
