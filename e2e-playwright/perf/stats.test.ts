import { describe, expect, it } from 'vitest'
import { buildAnswer, checkpointWord, END_MARKER, BEGIN_MARKER, tokenize } from './fixture.js'
import {
  compareMetrics,
  formatComparisonTable,
  fpsStats,
  higherIsBetter,
  longTaskStats,
  median,
  medianOfRuns,
} from './stats.js'

describe('perf bench stats', () => {
  it('keeps only long tasks that start inside the window', () => {
    const tasks: Array<[number, number]> = [
      [50, 80],
      [100, 60],
      [900, 200],
      [1200, 70],
    ]
    expect(longTaskStats(tasks, 100, 1000)).toEqual({ count: 2, totalMs: 260, maxMs: 200 })
  })

  it('reports average fps and the worst full second', () => {
    // 60 fps for the first second, then 10 frames in the second one.
    const frames = [
      ...Array.from({ length: 60 }, (_, i) => i * (1000 / 60)),
      ...Array.from({ length: 10 }, (_, i) => 1000 + i * 100),
    ]
    const stats = fpsStats(frames, 0, 2000)
    expect(stats.min).toBe(10)
    expect(stats.avg).toBeGreaterThan(30)
    expect(stats.worstFrameMs).toBeCloseTo(100, 0)
  })

  it('computes medians, treating missing keys as zero', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([1, 2, 3, 4])).toBe(2.5)
    expect(medianOfRuns([{ a: 1, b: 5 }, { a: 3 }, { a: 2, b: 7 }])).toEqual({ a: 2, b: 5 })
  })

  it('treats fps as the only higher-is-better metric', () => {
    expect(higherIsBetter('streaming.fps.avg')).toBe(true)
    expect(higherIsBetter('longSession.scroll.fps.min')).toBe(true)
    expect(higherIsBetter('streaming.longTasks.totalMs')).toBe(false)
    expect(higherIsBetter('streaming.fps.p95FrameMs')).toBe(false)
  })

  it('builds a before/after table with verdicts', () => {
    const rows = compareMetrics(
      { 'x.fps.avg': 30, 'x.longTasks.count': 100 },
      { 'x.fps.avg': 45, 'x.longTasks.count': 101 },
    )
    expect(rows.map((row) => row.verdict)).toEqual(['better', 'same'])
    const table = formatComparisonTable(rows, 'before', 'after')
    expect(table).toContain('| x.fps.avg | 30 | 45 | +50.0% | ✅ better |')
  })
})

describe('perf bench fixture', () => {
  it('is deterministic and reaches the requested size', () => {
    const a = buildAnswer(2000)
    const b = buildAnswer(2000)
    expect(a.text).toBe(b.text)
    expect(a.tokens.length).toBeGreaterThanOrEqual(2000)
    expect(a.tokens.join('')).toBe(a.text)
    expect(a.text.startsWith(BEGIN_MARKER)).toBe(true)
    expect(a.text.trimEnd().endsWith(END_MARKER)).toBe(true)
  })

  it('tracks the last emitted checkpoint for every token', () => {
    const answer = buildAnswer(500)
    const last = answer.checkpointAt[answer.checkpointAt.length - 1] ?? 0
    expect(last).toBeGreaterThan(5)
    expect(answer.text).toContain(checkpointWord(last))
    expect(answer.text).not.toContain(checkpointWord(last + 1))
    // Monotonic: a checkpoint never goes back.
    expect(answer.checkpointAt.every((n, i) => i === 0 || n >= (answer.checkpointAt[i - 1] ?? 0))).toBe(true)
  })

  it('keeps whitespace attached to the following word', () => {
    expect(tokenize('a b\n\nc')).toEqual(['a', ' b', '\n\nc'])
  })
})
