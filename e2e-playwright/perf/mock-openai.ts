/**
 * Minimal OpenAI-compatible backend for the mobile performance bench.
 *
 * `POST /v1/chat/completions` with `stream: true` answers with Server-Sent
 * Events at a fixed token rate (default 100 tokens/s). The answer is chosen by a
 * keyword in the user messages:
 *
 *   - `perf:stream` → the streaming scenario answer
 *   - `perf:long`   → a longer answer for the reconnection scenario
 *   - `perf:seed`   → scripted read_file steps that give a session its history
 *   - `perf:agent`  → scripted agent steps (thinking, text, streamed write_file)
 *   - anything else → a one-line answer (title generation, warm-up, ...)
 *
 * The keyword of the latest prompt that has one wins, so a session seeded with
 * `perf:seed` can then stream a `perf:stream` answer. Scripted turns pick their
 * step from the number of tool results since that prompt (see agent-script.ts).
 *
 * Emission is paced against wall time rather than a fixed interval, so a late
 * timer catches up instead of stretching the stream: the average rate stays
 * exact and runs are comparable.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { PerfAnswer } from './fixture.js'
import type { ScriptedAnswer, TurnScript } from './agent-script.js'

export const MOCK_MODEL_ID = 'perf-mock'

export interface MockAnswers {
  stream: PerfAnswer
  long: PerfAnswer
}

export interface MockScripts {
  seed?: TurnScript
  agent?: TurnScript
  /** Rate of the seed turn: history only needs to exist, not to stream slowly. */
  seedTokensPerSecond?: number
}

export interface MockOpenAI {
  /** Base URL including `/v1`, as providers expect it. */
  url: string
  /** Last checkpoint number fully emitted by the current (or last) stream. */
  lastCheckpoint(): number
  /** Resolves once no stream is in flight. */
  waitForIdle(): Promise<void>
  /** Resolves when the next stream that starts from now on has finished. */
  nextStreamDone(): Promise<{ startedAt: number; finishedAt: number; tokens: number }>
  close(): Promise<void>
}

interface ChatRequest {
  stream?: boolean
  messages?: Array<{ role: string; content?: unknown }>
}

const KEYWORDS = ['perf:stream', 'perf:long', 'perf:seed', 'perf:agent'] as const
type Keyword = (typeof KEYWORDS)[number]

function messageText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((part: unknown) =>
      typeof part === 'object' && part !== null && 'text' in part ? String((part as { text: unknown }).text) : '',
    )
    .join(' ')
}

/**
 * Keyword of the latest user message that has one, and the number of tool
 * results after it (the step of a scripted turn). Searched backwards over every
 * user message: OpenFox appends system-generated user messages (agent
 * definition, reminders) after the prompt, so the last one is not the prompt.
 */
function latestPrompt(request: ChatRequest): { keyword: Keyword | null; step: number } {
  const messages = request.messages ?? []
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]!
    if (message.role !== 'user') continue
    const text = messageText(message.content)
    const keyword = KEYWORDS.find((k) => text.includes(k))
    if (keyword) {
      const step = messages.slice(index + 1).filter((m) => m.role === 'tool').length
      return { keyword, step }
    }
  }
  return { keyword: null, step: 0 }
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf-8')
}

function chunkPayload(id: string, created: number, delta: Record<string, unknown>, finish: string | null): string {
  return `data: ${JSON.stringify({
    id,
    object: 'chat.completion.chunk',
    created,
    model: MOCK_MODEL_ID,
    choices: [{ index: 0, delta, finish_reason: finish }],
  })}\n\n`
}

export async function startMockOpenAI(
  answers: MockAnswers,
  tokensPerSecond = 100,
  scripts: MockScripts = {},
): Promise<MockOpenAI> {
  let active = 0
  let lastCheckpoint = 0
  let idleWaiters: Array<() => void> = []
  let doneWaiters: Array<(info: { startedAt: number; finishedAt: number; tokens: number }) => void> = []

  const settleIdle = () => {
    if (active > 0) return
    const waiters = idleWaiters
    idleWaiters = []
    for (const resolve of waiters) resolve()
  }

  const streamAnswer = (res: ServerResponse, answer: PerfAnswer | null, text: string) => {
    const id = `chatcmpl-perf-${Date.now()}`
    const created = Math.floor(Date.now() / 1000)
    const tokens = answer?.tokens ?? [text]
    const startedAt = Date.now()
    const waiters = answer ? doneWaiters : []
    if (answer) doneWaiters = []
    active++
    if (answer) lastCheckpoint = 0

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })
    res.write(chunkPayload(id, created, { role: 'assistant', content: '' }, null))

    let sent = 0
    let closed = false
    const finish = () => {
      if (closed) return
      closed = true
      clearInterval(timer)
      active--
      settleIdle()
    }
    res.on('close', finish)

    const timer = setInterval(() => {
      const due = answer ? Math.min(tokens.length, Math.floor(((Date.now() - startedAt) * tokensPerSecond) / 1000)) : 1
      while (sent < due) {
        res.write(chunkPayload(id, created, { content: tokens[sent] }, null))
        if (answer) lastCheckpoint = answer.checkpointAt[sent] ?? lastCheckpoint
        sent++
      }
      if (sent >= tokens.length) {
        res.write(chunkPayload(id, created, {}, 'stop'))
        res.write(
          `data: ${JSON.stringify({
            id,
            object: 'chat.completion.chunk',
            created,
            model: MOCK_MODEL_ID,
            choices: [],
            usage: { prompt_tokens: 1000, completion_tokens: tokens.length, total_tokens: 1000 + tokens.length },
          })}\n\n`,
        )
        res.end('data: [DONE]\n\n')
        const info = { startedAt, finishedAt: Date.now(), tokens: tokens.length }
        for (const resolve of waiters) resolve(info)
        finish()
      }
    }, 10)
  }

  /** Stream one step of a scripted turn, paced like the answers. */
  const streamScripted = (res: ServerResponse, answer: ScriptedAnswer, rate: number) => {
    const id = `chatcmpl-perf-${Date.now()}`
    const created = Math.floor(Date.now() / 1000)
    const startedAt = Date.now()
    active++
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
    res.write(chunkPayload(id, created, { role: 'assistant', content: '' }, null))
    let sent = 0
    let closed = false
    const finish = () => {
      if (closed) return
      closed = true
      clearInterval(timer)
      active--
      settleIdle()
    }
    res.on('close', finish)
    const timer = setInterval(() => {
      const due = Math.min(answer.deltas.length, Math.floor(((Date.now() - startedAt) * rate) / 1000) + 1)
      while (sent < due) res.write(chunkPayload(id, created, answer.deltas[sent++]!, null))
      if (sent < answer.deltas.length) return
      res.write(chunkPayload(id, created, {}, answer.finish))
      res.write(
        `data: ${JSON.stringify({
          id,
          object: 'chat.completion.chunk',
          created,
          model: MOCK_MODEL_ID,
          choices: [],
          usage: {
            prompt_tokens: 1000,
            completion_tokens: answer.deltas.length,
            total_tokens: 1000 + answer.deltas.length,
          },
        })}\n\n`,
      )
      res.end('data: [DONE]\n\n')
      finish()
    }, 10)
  }

  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    const path = (req.url ?? '').split('?')[0] ?? ''
    if (process.env['PERF_DEBUG']) console.log(`[mock] ${req.method} ${path}`)
    if (req.method === 'GET' && path.endsWith('/models')) {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          object: 'list',
          data: [{ id: MOCK_MODEL_ID, object: 'model', owned_by: 'perf', max_model_len: 200_000 }],
        }),
      )
      return
    }
    if (req.method === 'POST' && path.endsWith('/chat/completions')) {
      const request = JSON.parse((await readBody(req)) || '{}') as ChatRequest
      const { keyword, step } = latestPrompt(request)
      const script = keyword === 'perf:seed' ? scripts.seed : keyword === 'perf:agent' ? scripts.agent : undefined
      if (script && request.stream) {
        const rate = keyword === 'perf:seed' ? (scripts.seedTokensPerSecond ?? 5000) : tokensPerSecond
        streamScripted(res, script(step), rate)
        return
      }
      const answer = keyword === 'perf:long' ? answers.long : keyword === 'perf:stream' ? answers.stream : null
      const text = 'Perf bench session'
      if (request.stream) {
        streamAnswer(res, answer, text)
        return
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          id: `chatcmpl-perf-${Date.now()}`,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: MOCK_MODEL_ID,
          choices: [{ index: 0, message: { role: 'assistant', content: answer?.text ?? text }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1000, completion_tokens: 10, total_tokens: 1010 },
        }),
      )
      return
    }
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: { message: `No mock for ${req.method} ${path}` } }))
  }

  const server: Server = createServer((req, res) => {
    handle(req, res).catch((error: unknown) => {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: { message: String(error) } }))
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo

  return {
    url: `http://127.0.0.1:${port}/v1`,
    lastCheckpoint: () => lastCheckpoint,
    waitForIdle: () =>
      new Promise<void>((resolve) => {
        idleWaiters.push(resolve)
        settleIdle()
      }),
    nextStreamDone: () => new Promise((resolve) => doneWaiters.push(resolve)),
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections()
        server.close(() => resolve())
      }),
  }
}
