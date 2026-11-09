import { describe, expect, it } from 'vitest'
import type { ModelSessionStats } from '@shared/types.js'
import { chartGeometry, compactTokens, contextRange, nearestPoint, statsExport } from './statsView'

describe('compactTokens', () => {
  it('uses k and M', () => {
    expect(compactTokens(950)).toBe('950')
    expect(compactTokens(1500)).toBe('1.5k')
    expect(compactTokens(2_500_000)).toBe('2.5M')
  })
})

describe('contextRange', () => {
  it('collapses equal values and shows a span otherwise', () => {
    expect(contextRange([2000, 2000])).toBe('2.0k')
    expect(contextRange([1000, 3000])).toBe('1.0k-3.0k')
    expect(contextRange([])).toBe('0')
  })
})

describe('chartGeometry', () => {
  const points = [
    { x: 10, y: 0 },
    { x: 20, y: 50 },
    { x: 30, y: 100 },
  ]

  it('spans the width and starts the scale at zero', () => {
    const geometry = chartGeometry(points, 300, 100)
    expect(geometry.maxY).toBe(100)
    expect(geometry.points.map((point) => point.left)).toEqual([0, 150, 300])
    expect(geometry.points.map((point) => point.top)).toEqual([100, 50, 0])
    expect(geometry.path).toBe('M 0 100 L 150 50 L 300 0')
  })

  it('sorts by x', () => {
    const geometry = chartGeometry([points[2]!, points[0]!], 100, 100)
    expect(geometry.points.map((point) => point.x)).toEqual([10, 30])
  })

  it('centres a lone point and survives an all-zero series', () => {
    const geometry = chartGeometry([{ x: 5, y: 0 }], 100, 40)
    expect(geometry.points[0]).toMatchObject({ left: 50, top: 40 })
    expect(geometry.maxY).toBe(0)
  })
})

describe('nearestPoint', () => {
  it('picks the closest point to the pointer', () => {
    const points = [{ left: 0 }, { left: 100 }, { left: 200 }]
    expect(nearestPoint(points, 40)).toBe(0)
    expect(nearestPoint(points, 60)).toBe(1)
    expect(nearestPoint(points, 999)).toBe(2)
  })
})

describe('statsExport', () => {
  it('keeps the summary, responses and calls', () => {
    const stats = {
      providerId: 'p',
      providerName: 'P',
      backend: 'x',
      model: 'm',
      label: 'l',
      totalTime: 3,
      aiTime: 2,
      toolTime: 1,
      prefillTokens: 10,
      generationTokens: 5,
      avgPrefillSpeed: 1,
      avgGenerationSpeed: 2,
      responseCount: 1,
      llmCallCount: 1,
      dataPoints: [{ responseIndex: 1, timestamp: 't', mode: 'builder', prefillTokens: 10 }],
      callDataPoints: [{ sessionCallIndex: 1, responseIndex: 1, callIndex: 1, promptTokens: 10, ttft: 0.5 }],
    } as unknown as ModelSessionStats
    const data = statsExport(stats, new Date('2026-11-09T08:00:00.000Z'))
    expect(data.exportedAt).toBe('2026-11-09T08:00:00.000Z')
    expect(data.summary.responseCount).toBe(1)
    expect(data.responses[0]).toMatchObject({ responseIndex: 1, prefillTokens: 10 })
    expect(data.llmCalls[0]).toMatchObject({ sessionCallIndex: 1, ttft: 0.5 })
  })
})
