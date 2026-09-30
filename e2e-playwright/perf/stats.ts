/**
 * Pure helpers for the mobile performance bench: windowing of page samples,
 * medians across runs and the before/after table. No I/O, so they are unit
 * tested (stats.test.ts).
 */

import { deltaPct, formatDelta, verdict, type Verdict } from '../../scripts/bench/compare.js'
import { summarizeFrames } from '../../scripts/bench/frames.js'

/** Changes under this are reported as noise. Higher than scripts/bench's 3%: the throttled runs are noisier. */
export const PERF_NOISE_PCT = 5

export type Metrics = Record<string, number>

export interface LongTaskStats {
  count: number
  totalMs: number
  maxMs: number
}

/** Long tasks that started inside [start, end]. */
export function longTaskStats(longTasks: Array<[number, number]>, start: number, end: number): LongTaskStats {
  const inWindow = longTasks.filter(([startTime]) => startTime >= start && startTime <= end).map(([, d]) => d)
  return {
    count: inWindow.length,
    totalMs: Math.round(inWindow.reduce((sum, d) => sum + d, 0)),
    maxMs: Math.round(inWindow.reduce((max, d) => Math.max(max, d), 0)),
  }
}

export interface FpsStats {
  avg: number
  /** Lowest frame count over any full 1-second slice of the window. */
  min: number
  p95FrameMs: number
  worstFrameMs: number
  longFrames: number
}

export function fpsStats(frames: number[], start: number, end: number): FpsStats {
  const inWindow = frames.filter((t) => t >= start && t <= end)
  const summary = summarizeFrames(inWindow)
  const fullSeconds = Math.floor((end - start) / 1000)
  let min = summary.fps
  for (let second = 0; second < fullSeconds; second++) {
    const from = start + second * 1000
    const count = inWindow.filter((t) => t >= from && t < from + 1000).length
    min = Math.min(min, count)
  }
  return {
    avg: summary.fps,
    min,
    p95FrameMs: summary.p95FrameMs,
    worstFrameMs: summary.worstFrameMs,
    longFrames: summary.longFrames,
  }
}

export function heapPeakMb(heap: Array<[number, number]>, start: number, end: number): number {
  const peak = heap.filter(([t]) => t >= start && t <= end).reduce((max, [, bytes]) => Math.max(max, bytes), 0)
  return toMb(peak)
}

export function toMb(bytes: number): number {
  return Number((bytes / 1024 / 1024).toFixed(1))
}

export function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const value = sorted.length % 2 === 1 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
  return Number(value.toFixed(1))
}

/** Per-key median across runs. A key missing from a run counts as 0 (e.g. a component that never rendered). */
export function medianOfRuns(runs: Metrics[]): Metrics {
  const keys = new Set(runs.flatMap((run) => Object.keys(run)))
  const result: Metrics = {}
  for (const key of [...keys].sort()) {
    result[key] = median(runs.map((run) => run[key] ?? 0))
  }
  return result
}

/** FPS is the only metric where more is better; everything else is a cost. */
export function higherIsBetter(key: string): boolean {
  return /(^|\.)fps\.(avg|min)$/.test(key)
}

export interface ComparisonRow {
  metric: string
  before: number | null
  after: number | null
  delta: string
  verdict: Verdict
}

export function compareMetrics(before: Metrics, after: Metrics, noisePct = PERF_NOISE_PCT): ComparisonRow[] {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()
  return keys.map((metric) => {
    const b = before[metric] ?? null
    const a = after[metric] ?? null
    return {
      metric,
      before: b,
      after: a,
      delta: formatDelta(deltaPct(b, a)),
      verdict: verdict(b, a, higherIsBetter(metric), noisePct),
    }
  })
}

const VERDICT_LABEL: Record<Verdict, string> = { better: '✅ better', worse: '❌ worse', same: '≈' }

export function formatComparisonTable(rows: ComparisonRow[], beforeLabel: string, afterLabel: string): string {
  const cell = (value: number | null) => (value === null ? '–' : String(value))
  const lines = [
    `| Metric | ${beforeLabel} | ${afterLabel} | Δ | |`,
    '| --- | ---: | ---: | ---: | --- |',
    ...rows.map(
      (row) =>
        `| ${row.metric} | ${cell(row.before)} | ${cell(row.after)} | ${row.delta} | ${VERDICT_LABEL[row.verdict]} |`,
    ),
  ]
  return lines.join('\n')
}
