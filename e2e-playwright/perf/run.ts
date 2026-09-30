/**
 * Mobile performance bench — measures what a phone feels while OpenFox streams.
 *
 * Boots the built app against a fake OpenAI-compatible backend (mock-openai.ts,
 * 100 tokens/s, fixed content) with an isolated HOME/XDG config and an
 * in-memory DB, then drives headless Chromium with a mobile viewport and 4x CPU
 * throttling through three scenarios:
 *
 *   1. streaming    — one long markdown/code answer streamed end to end
 *   2. reconnect    — WebSocket and REST cut for 30 s mid-stream, then restored
 *   3. long session — ~200 existing messages: first render + fast scroll up
 *
 * Each run restarts the app. The per-metric median across runs is written to
 * perf-results/<timestamp>-<branch>.json. See README.md.
 *
 * Usage:
 *   npm run perf                        # build + 3 runs
 *   npm run perf -- --runs 1 --skip-build
 *   npm run perf -- --compare perf-results/baseline-develop.json
 */

import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { cpus, tmpdir, totalmem } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { chromium, type Browser, type BrowserContext, type CDPSession, type Page } from 'playwright'
import type { Session } from '../../src/shared/types.js'
import { buildAnswer, checkpointWord, END_MARKER, BEGIN_MARKER } from './fixture.js'
import { MOCK_MODEL_ID, startMockOpenAI, type MockOpenAI } from './mock-openai.js'
import { NETWORK_CUT_SOURCE, PERF_PROBE_SOURCE, SCROLL_UP_SOURCE, type PageProbeData } from './probes.js'
import { buildLongSession, LAST_MESSAGE_MARKER } from './session-fixture.js'
import {
  compareMetrics,
  formatComparisonTable,
  fpsStats,
  heapPeakMb,
  longTaskStats,
  medianOfRuns,
  toMb,
  type Metrics,
} from './stats.js'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const RESULTS_DIR = join(REPO_ROOT, 'perf-results')
const CHAT_SCROLL_SELECTOR = '[data-testid="chat-scroll-container"]'
const CHAT_INPUT_SELECTOR = '[data-testid="chat-input-textarea"]'

const CPU_THROTTLE = 4
const TOKENS_PER_SECOND = 100
const STREAM_TOKENS = 2000
/** Long enough to cover: 5 s of streaming, a 30 s outage, then the catch-up. */
const LONG_TOKENS = 4500
const OUTAGE_MS = 30_000
const LONG_SESSION_MESSAGES = 200
/** What the server sends for a long session: the display window, the rest is hidden. */
const LONG_SESSION_WINDOW = 100
const TOP_COMPONENTS = 40

const MOBILE_CONTEXT = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  serviceWorkers: 'block' as const,
}

type Scenario = 'streaming' | 'reconnect' | 'longSession'
const ALL_SCENARIOS: Scenario[] = ['streaming', 'reconnect', 'longSession']

interface Options {
  runs: number
  skipBuild: boolean
  scenarios: Scenario[]
  label: string | null
  compare: string | null
}

function parseOptions(): Options {
  const { values } = parseArgs({
    options: {
      runs: { type: 'string', default: '3' },
      'skip-build': { type: 'boolean', default: false },
      scenarios: { type: 'string', default: ALL_SCENARIOS.join(',') },
      label: { type: 'string' },
      compare: { type: 'string' },
    },
  })
  const scenarios = (values.scenarios ?? '').split(',').filter(Boolean) as Scenario[]
  for (const scenario of scenarios) {
    if (!ALL_SCENARIOS.includes(scenario))
      throw new Error(`Unknown scenario "${scenario}" (${ALL_SCENARIOS.join(', ')})`)
  }
  return {
    runs: Math.max(1, Number(values.runs) || 1),
    skipBuild: values['skip-build'] ?? false,
    scenarios,
    label: values.label ?? null,
    compare: values.compare ?? null,
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms))
}

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf-8' }).trim()
}

async function api<T>(serverUrl: string, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${serverUrl}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
  if (!response.ok) {
    throw new Error(`${init.method ?? 'GET'} ${path} failed: HTTP ${response.status} ${await response.text()}`)
  }
  return (await response.json()) as T
}

/**
 * Production build of the server + web app. The web bundle is built without
 * minification so React component names survive for the render counts; the
 * code is otherwise identical to a release build (production React, same
 * chunks), so timings stay representative.
 */
function build(): void {
  console.log('[perf] building server + unminified web bundle...')
  execFileSync('npm', ['run', 'build:server'], { cwd: REPO_ROOT, stdio: 'inherit' })
  execFileSync('npx', ['vite', 'build', '--outDir', '../dist/web', '--emptyOutDir', '--minify', 'false'], {
    cwd: join(REPO_ROOT, 'web'),
    stdio: 'inherit',
  })
}

interface App {
  serverUrl: string
  projectId: string
  stop(): Promise<void>
}

async function waitForHealth(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${url}/api/health`)).ok) return
    } catch {
      // not up yet
    }
    await delay(250)
  }
  throw new Error(`OpenFox did not become healthy at ${url}`)
}

/** Boot the built app with a throwaway HOME: the real ~/.config/openfox is never read nor written. */
async function bootApp(mock: MockOpenAI): Promise<App> {
  const root = await mkdtemp(join(tmpdir(), 'openfox-perf-'))
  const home = join(root, 'home')
  const workdir = join(root, 'project')
  await mkdir(join(home, 'openfox'), { recursive: true })
  await mkdir(workdir, { recursive: true })
  await writeFile(join(workdir, 'README.md'), '# Perf bench project\n')
  // A pre-existing config keeps the CLI out of its interactive first-run wizard.
  await writeFile(
    join(home, 'openfox', 'config.json'),
    JSON.stringify({ workspace: { workdir }, server: { openBrowser: false } }, null, 2),
  )

  const port = 20_000 + Math.floor(Math.random() * 20_000)
  const serverUrl = `http://127.0.0.1:${port}`
  const server: ChildProcess = spawn('node', ['dist/cli/index.js', '--port', String(port), '--no-browser'], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      HOME: home,
      XDG_CONFIG_HOME: home,
      XDG_DATA_HOME: home,
      OPENFOX_PORT: String(port),
      OPENFOX_DB_PATH: ':memory:',
      OPENFOX_WORKDIR: workdir,
      OPENFOX_LLM_URL: mock.url,
      OPENFOX_MODEL_NAME: MOCK_MODEL_ID,
      OPENFOX_DISABLE_AUTO_SESSION_TITLE: 'true',
      OPENFOX_LOG_LEVEL: 'warn',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    // Own process group: the CLI re-spawns itself with a bigger heap, so killing
    // only the direct child would leave that grandchild server running.
    detached: true,
  })
  const debug = Boolean(process.env['PERF_DEBUG'])
  server.stdout?.on('data', (chunk: Buffer) => {
    if (debug) process.stdout.write(`[server] ${chunk.toString()}`)
  })
  server.stderr?.on('data', (chunk: Buffer) => {
    const text = chunk.toString()
    if (debug || /error/i.test(text)) process.stderr.write(`[server] ${text}`)
  })

  const killGroup = (signal: NodeJS.Signals) => {
    try {
      if (server.pid) process.kill(-server.pid, signal)
    } catch {
      // group already gone
    }
  }
  const stop = async () => {
    if (server.exitCode === null) {
      const exited = new Promise((done) => server.once('exit', done))
      killGroup('SIGTERM')
      await Promise.race([exited, delay(5000)])
    }
    killGroup('SIGKILL')
    await rm(root, { recursive: true, force: true })
  }

  try {
    await waitForHealth(serverUrl, 90_000)
    // A registered provider keeps the web app out of onboarding.
    await api(serverUrl, '/api/providers', {
      method: 'POST',
      body: JSON.stringify({ name: 'Perf mock', url: mock.url, backend: 'vllm', model: MOCK_MODEL_ID, isLocal: true }),
    })
    const { project } = await api<{ project: { id: string } }>(serverUrl, '/api/projects', {
      method: 'POST',
      body: JSON.stringify({ name: 'Perf bench', workdir }),
    })
    return { serverUrl, projectId: project.id, stop }
  } catch (error) {
    await stop()
    throw error
  }
}

async function createSession(app: App, title: string): Promise<Session> {
  const { session } = await api<{ session: Session }>(app.serverUrl, '/api/sessions', {
    method: 'POST',
    body: JSON.stringify({ projectId: app.projectId, title }),
  })
  return session
}

async function sendPrompt(app: App, sessionId: string, content: string): Promise<void> {
  await api(app.serverUrl, `/api/sessions/${sessionId}/message`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  })
}

interface OpenedPage {
  page: Page
  cdp: CDPSession
  /** CDP counters right before navigation, to measure the page load itself. */
  beforeLoad: Record<string, number>
}

async function openSession(
  context: BrowserContext,
  app: App,
  sessionId: string,
  initScripts: string[],
  throttleBeforeLoad = false,
): Promise<OpenedPage> {
  const page = await context.newPage()
  for (const script of initScripts) await page.addInitScript(script)
  const cdp = await context.newCDPSession(page)
  await cdp.send('Performance.enable')
  if (throttleBeforeLoad) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE })
  const beforeLoad = await cdpMetrics(cdp)
  await page.goto(`${app.serverUrl}/p/${app.projectId}/s/${sessionId}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector(CHAT_INPUT_SELECTOR, { timeout: 60_000 })
  return { page, cdp, beforeLoad }
}

async function throttle(cdp: CDPSession): Promise<void> {
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE })
}

async function cdpMetrics(cdp: CDPSession): Promise<Record<string, number>> {
  const { metrics } = (await cdp.send('Performance.getMetrics')) as { metrics: Array<{ name: string; value: number }> }
  return Object.fromEntries(metrics.map((metric) => [metric.name, metric.value]))
}

function cdpDelta(before: Record<string, number>, after: Record<string, number>, prefix: string): Metrics {
  const seconds = (name: string) => Math.round(((after[name] ?? 0) - (before[name] ?? 0)) * 1000)
  const count = (name: string) => (after[name] ?? 0) - (before[name] ?? 0)
  return {
    [`${prefix}.cdp.scriptMs`]: seconds('ScriptDuration'),
    [`${prefix}.cdp.layoutMs`]: seconds('LayoutDuration'),
    [`${prefix}.cdp.styleMs`]: seconds('RecalcStyleDuration'),
    [`${prefix}.cdp.taskMs`]: seconds('TaskDuration'),
    [`${prefix}.cdp.layoutCount`]: count('LayoutCount'),
    [`${prefix}.cdp.styleCount`]: count('RecalcStyleCount'),
  }
}

async function readProbe(page: Page): Promise<PageProbeData> {
  return page.evaluate(() => (window as unknown as { __perf: PageProbeData }).__perf)
}

async function startCounting(page: Page): Promise<number> {
  return page.evaluate(() => {
    const probe = (window as unknown as { __perf: PageProbeData & { counting: boolean } }).__perf
    probe.renders = {}
    probe.commits = 0
    probe.counting = true
    return performance.now()
  })
}

async function stopCounting(page: Page): Promise<number> {
  return page.evaluate(() => {
    ;(window as unknown as { __perf: { counting: boolean } }).__perf.counting = false
    return performance.now()
  })
}

/** Resolve with the page time at which `word` is in the chat feed (polled every 50 ms). */
async function waitForWord(page: Page, word: string, timeoutMs: number): Promise<number> {
  const handle = await page.waitForFunction(
    ({ selector, target }) =>
      document.querySelector(selector)?.textContent?.includes(target) ? performance.now() : false,
    { selector: CHAT_SCROLL_SELECTOR, target: word },
    { polling: 50, timeout: timeoutMs },
  )
  return (await handle.jsonValue()) as number
}

/**
 * Wait until the main thread has had no long task for `quietMs` (async work
 * such as code highlighting can keep running well after the last message is
 * visible). Returns how long it took after the call, capped at `maxMs`.
 */
async function waitForQuiet(page: Page, quietMs = 2000, maxMs = 60_000): Promise<number> {
  const started = await page.evaluate(() => performance.now())
  for (;;) {
    const { now, lastEnd } = await page.evaluate(() => {
      const tasks = (window as unknown as { __perf: PageProbeData }).__perf.longTasks
      const last = tasks[tasks.length - 1]
      return { now: performance.now(), lastEnd: last ? last[0] + last[1] : 0 }
    })
    if (now - lastEnd >= quietMs || now - started >= maxMs) return Math.round(now - started)
    await delay(250)
  }
}

function windowMetrics(probe: PageProbeData, prefix: string, start: number, end: number): Metrics {
  const tasks = longTaskStats(probe.longTasks, start, end)
  const fps = fpsStats(probe.frames, start, end)
  return {
    [`${prefix}.durationMs`]: Math.round(end - start),
    [`${prefix}.longTasks.count`]: tasks.count,
    [`${prefix}.longTasks.totalMs`]: tasks.totalMs,
    [`${prefix}.longTasks.maxMs`]: tasks.maxMs,
    [`${prefix}.fps.avg`]: fps.avg,
    [`${prefix}.fps.min`]: fps.min,
    [`${prefix}.fps.p95FrameMs`]: fps.p95FrameMs,
    [`${prefix}.fps.worstFrameMs`]: fps.worstFrameMs,
  }
}

function renderMetrics(probe: PageProbeData, prefix: string): Metrics {
  const entries = Object.entries(probe.renders).sort((a, b) => b[1] - a[1])
  const metrics: Metrics = {
    [`${prefix}.react.commits`]: probe.commits,
    [`${prefix}.react.renders`]: entries.reduce((sum, [, count]) => sum + count, 0),
  }
  for (const [name, count] of entries.slice(0, TOP_COMPONENTS)) {
    metrics[`${prefix}.react.renders.${name}`] = count
  }
  return metrics
}

async function scenarioStreaming(context: BrowserContext, app: App, mock: MockOpenAI): Promise<Metrics> {
  const session = await createSession(app, 'Perf streaming')
  const { page, cdp } = await openSession(context, app, session.id, [PERF_PROBE_SOURCE])
  await delay(1500)
  await throttle(cdp)
  await cdp.send('HeapProfiler.collectGarbage')
  const before = await cdpMetrics(cdp)

  const streamDone = mock.nextStreamDone()
  const start = await startCounting(page)
  await sendPrompt(app, session.id, 'perf:stream Walk me through the streaming pipeline.')
  const firstToken = await waitForWord(page, BEGIN_MARKER, 30_000)
  const stream = await streamDone
  await waitForWord(page, END_MARKER, 120_000)
  const endLagMs = Date.now() - stream.finishedAt
  const end = await stopCounting(page)

  const after = await cdpMetrics(cdp)
  const probe = await readProbe(page)
  await cdp.send('HeapProfiler.collectGarbage')
  const afterGc = await cdpMetrics(cdp)
  await mock.waitForIdle()

  return {
    ...windowMetrics(probe, 'streaming', start, end),
    'streaming.firstTokenMs': Math.round(firstToken - start),
    'streaming.endLagMs': endLagMs,
    'streaming.heap.peakMb': heapPeakMb(probe.heap, start, end),
    'streaming.heap.afterGcMb': toMb(afterGc['JSHeapUsedSize'] ?? 0),
    ...cdpDelta(before, after, 'streaming'),
    ...renderMetrics(probe, 'streaming'),
  }
}

async function scenarioReconnect(context: BrowserContext, app: App, mock: MockOpenAI): Promise<Metrics> {
  const session = await createSession(app, 'Perf reconnect')
  const { page, cdp } = await openSession(context, app, session.id, [PERF_PROBE_SOURCE, NETWORK_CUT_SOURCE])
  await delay(1500)
  await throttle(cdp)

  const streamDone = mock.nextStreamDone()
  await sendPrompt(app, session.id, 'perf:long Walk me through the streaming pipeline in depth.')
  await waitForWord(page, BEGIN_MARKER, 30_000)
  await delay(5000)
  await page.evaluate(() => (window as unknown as { __net: { cut(): void } }).__net.cut())
  await delay(OUTAGE_MS)

  const expected = mock.lastCheckpoint()
  const restoredAt = await page.evaluate(() => {
    ;(window as unknown as { __net: { restore(): void } }).__net.restore()
    return performance.now()
  })
  const caughtUpAt = await waitForWord(page, checkpointWord(expected), 120_000)
  const reopenedAt = await page.evaluate(
    (since) => (window as unknown as { __net: { opens: number[] } }).__net.opens.find((t) => t >= since) ?? null,
    restoredAt,
  )
  const probe = await readProbe(page)
  const tasks = longTaskStats(probe.longTasks, restoredAt, caughtUpAt)

  await streamDone
  await mock.waitForIdle()

  return {
    'reconnect.reconnectMs': reopenedAt === null ? -1 : Math.round(reopenedAt - restoredAt),
    'reconnect.catchUpMs': Math.round(caughtUpAt - restoredAt),
    'reconnect.longTasks.count': tasks.count,
    'reconnect.longTasks.totalMs': tasks.totalMs,
    'reconnect.longTasks.maxMs': tasks.maxMs,
  }
}

async function scenarioLongSession(context: BrowserContext, app: App): Promise<Metrics> {
  const created = await createSession(app, 'Perf long session')
  const messages = buildLongSession(LONG_SESSION_MESSAGES)
  // Serve the history the way the server would: the display window, with the
  // older part reported as hidden. The session itself is real, so the
  // WebSocket session.load that follows succeeds.
  await context.route(`**/api/sessions/${created.id}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        session: { ...created, isRunning: false },
        messages: messages.slice(-LONG_SESSION_WINDOW),
        hiddenCount: messages.length - LONG_SESSION_WINDOW,
        sessionStats: null,
        contextState: null,
        queueState: [],
        pendingQuestions: [],
        pendingConfirmations: [],
        activeWorkflowExecution: null,
      }),
    }),
  )
  const { page, cdp, beforeLoad } = await openSession(context, app, created.id, [PERF_PROBE_SOURCE], true)
  const renderedAt = await waitForWord(page, LAST_MESSAGE_MARKER, 60_000)
  const loadProbe = await readProbe(page)
  const loadTasks = longTaskStats(loadProbe.longTasks, 0, renderedAt)
  const afterLoad = await cdpMetrics(cdp)
  const quietAfterMs = await waitForQuiet(page)

  const scroll = (await page.evaluate(`(${SCROLL_UP_SOURCE})(${JSON.stringify(CHAT_SCROLL_SELECTOR)})`)) as {
    start: number
    end: number
    mountedItems: number
  }

  const probe = await readProbe(page)
  const domElements = await page.evaluate(() => document.getElementsByTagName('*').length)
  return {
    'longSession.initialRenderMs': Math.round(renderedAt),
    'longSession.load.longTasks.count': loadTasks.count,
    'longSession.load.longTasks.totalMs': loadTasks.totalMs,
    'longSession.load.longTasks.maxMs': loadTasks.maxMs,
    ...cdpDelta(beforeLoad, afterLoad, 'longSession.load'),
    ...windowMetrics(probe, 'longSession.scroll', scroll.start, scroll.end),
    'longSession.scroll.mountedItems': scroll.mountedItems,
    'longSession.quietAfterMs': quietAfterMs,
    'longSession.domElements': domElements,
  }
}

/** Fresh mobile context per scenario; on failure, save a screenshot + page text to perf-results/. */
async function inMobileContext(
  browser: Browser,
  scenario: string,
  run: (context: BrowserContext) => Promise<Metrics>,
): Promise<Metrics> {
  const context = await browser.newContext(MOBILE_CONTEXT)
  try {
    return await run(context)
  } catch (error) {
    await mkdir(RESULTS_DIR, { recursive: true })
    for (const [index, page] of context.pages().entries()) {
      const base = join(RESULTS_DIR, `failure-${scenario}-${index}`)
      await page.screenshot({ path: `${base}.png`, fullPage: true }).catch(() => {})
      const text = await page.evaluate(() => document.body.innerText).catch(() => '')
      await writeFile(`${base}.txt`, text).catch(() => {})
    }
    console.error(`[perf] ${scenario} failed; captures in ${RESULTS_DIR}/failure-${scenario}-*`)
    throw error
  } finally {
    await context.close()
  }
}

async function runOnce(options: Options, index: number): Promise<Metrics> {
  const answers = { stream: buildAnswer(STREAM_TOKENS), long: buildAnswer(LONG_TOKENS) }
  const mock = await startMockOpenAI(answers, TOKENS_PER_SECOND)
  let app: App | null = null
  let browser: Browser | null = null
  try {
    app = await bootApp(mock)
    const booted = app
    const launched = await chromium.launch({ headless: true, args: ['--enable-precise-memory-info'] })
    browser = launched
    // Unrecorded warm-up: the first page of a fresh headless Chromium scrolls
    // ~5x slower than any later one (cold compile/raster caches). A phone
    // browser that is already open is warm, so measure warm.
    console.log(`[perf] run ${index + 1}/${options.runs} — warm-up`)
    await inMobileContext(launched, 'warmup', (context) => scenarioLongSession(context, booted))
    const metrics: Metrics = {}
    for (const scenario of options.scenarios) {
      console.log(`[perf] run ${index + 1}/${options.runs} — ${scenario}`)
      const current = app
      const result = await inMobileContext(launched, scenario, (context) =>
        scenario === 'streaming'
          ? scenarioStreaming(context, current, mock)
          : scenario === 'reconnect'
            ? scenarioReconnect(context, current, mock)
            : scenarioLongSession(context, current),
      )
      Object.assign(metrics, result)
    }
    return metrics
  } finally {
    await browser?.close()
    await app?.stop()
    await mock.close()
  }
}

function printSummary(median: Metrics): void {
  const rows = Object.entries(median).filter(([key]) => !key.includes('.react.renders.'))
  console.log('\n| Metric | Median |\n| --- | ---: |')
  for (const [key, value] of rows) console.log(`| ${key} | ${value} |`)
}

async function main(): Promise<void> {
  const options = parseOptions()
  if (!options.skipBuild) build()

  const branch = git('rev-parse', '--abbrev-ref', 'HEAD')
  const commit = git('rev-parse', '--short', 'HEAD')
  const dirty = git('status', '--porcelain', '--untracked-files=no').length > 0

  const runs: Metrics[] = []
  for (let index = 0; index < options.runs; index++) {
    runs.push(await runOnce(options, index))
  }
  const median = medianOfRuns(runs)

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
  const label = (options.label ?? branch).replace(/[^\w.-]+/g, '-')
  await mkdir(RESULTS_DIR, { recursive: true })
  const outPath = join(RESULTS_DIR, `${stamp}-${label}.json`)
  const report = {
    branch,
    commit,
    dirty,
    label: options.label,
    date: new Date().toISOString(),
    machine: {
      cpus: cpus().length,
      cpuModel: cpus()[0]?.model ?? 'unknown',
      memoryGb: Math.round(totalmem() / 2 ** 30),
    },
    config: {
      cpuThrottle: CPU_THROTTLE,
      tokensPerSecond: TOKENS_PER_SECOND,
      streamTokens: STREAM_TOKENS,
      longTokens: LONG_TOKENS,
      outageMs: OUTAGE_MS,
      longSessionMessages: LONG_SESSION_MESSAGES,
      viewport: MOBILE_CONTEXT.viewport,
      scenarios: options.scenarios,
      runs: options.runs,
    },
    median,
    runs,
  }
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`)
  printSummary(median)
  console.log(`\n[perf] wrote ${outPath}`)

  if (options.compare) {
    const previous = JSON.parse(await readFile(options.compare, 'utf-8')) as {
      median: Metrics
      label?: string
      branch: string
    }
    const rows = compareMetrics(previous.median, median).filter((row) => !row.metric.includes('.react.renders.'))
    console.log(`\n${formatComparisonTable(rows, previous.label ?? previous.branch, options.label ?? branch)}`)
  }
}

main()
  // Undici keep-alive sockets can hold the event loop open after the run.
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
