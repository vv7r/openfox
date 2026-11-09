import type { ModelSessionStats } from '@shared/types.js'

export function compactTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`
  return String(value)
}

export function contextRange(tokens: number[]): string {
  if (tokens.length === 0) return '0'
  const min = Math.min(...tokens)
  const max = Math.max(...tokens)
  return min === max ? compactTokens(min) : `${compactTokens(min)}-${compactTokens(max)}`
}

export interface ChartPoint {
  x: number
  y: number
  left: number
  top: number
}

/** Plots a series in a width by height box, on a scale that starts at zero. */
export function chartGeometry(
  data: Array<{ x: number; y: number }>,
  width: number,
  height: number,
): { points: ChartPoint[]; path: string; maxY: number } {
  const sorted = [...data].sort((a, b) => a.x - b.x)
  const maxY = Math.max(0, ...sorted.map((point) => point.y))
  const first = sorted[0]?.x ?? 0
  const span = (sorted[sorted.length - 1]?.x ?? 0) - first
  const points = sorted.map((point) => ({
    ...point,
    left: span === 0 ? width / 2 : ((point.x - first) / span) * width,
    top: maxY === 0 ? height : height - (point.y / maxY) * height,
  }))
  return {
    points,
    maxY,
    path: points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.left} ${point.top}`).join(' '),
  }
}

export function nearestPoint(points: Array<{ left: number }>, left: number): number {
  let best = 0
  points.forEach((point, index) => {
    if (Math.abs(point.left - left) < Math.abs(points[best]!.left - left)) best = index
  })
  return best
}

export function statsExport(stats: ModelSessionStats, now: Date = new Date()) {
  return {
    exportedAt: now.toISOString(),
    providerId: stats.providerId,
    providerName: stats.providerName,
    backend: stats.backend,
    model: stats.model,
    label: stats.label,
    summary: {
      totalTime: stats.totalTime,
      aiTime: stats.aiTime,
      toolTime: stats.toolTime,
      prefillTokens: stats.prefillTokens,
      generationTokens: stats.generationTokens,
      avgPrefillSpeed: stats.avgPrefillSpeed,
      avgGenerationSpeed: stats.avgGenerationSpeed,
      responseCount: stats.responseCount,
      llmCallCount: stats.llmCallCount,
    },
    responses: stats.dataPoints.map((point) => ({
      responseIndex: point.responseIndex,
      timestamp: point.timestamp,
      mode: point.mode,
      prefillTokens: point.prefillTokens,
      generationTokens: point.generationTokens,
      prefillSpeed: point.prefillSpeed,
      generationSpeed: point.generationSpeed,
      totalTime: point.totalTime,
      aiTime: point.aiTime,
      toolTime: point.toolTime,
    })),
    llmCalls: stats.callDataPoints.map((point) => ({
      sessionCallIndex: point.sessionCallIndex,
      responseIndex: point.responseIndex,
      callIndex: point.callIndex,
      timestamp: point.timestamp,
      mode: point.mode,
      promptTokens: point.promptTokens,
      completionTokens: point.completionTokens,
      ttft: point.ttft,
      completionTime: point.completionTime,
      prefillSpeed: point.prefillSpeed,
      generationSpeed: point.generationSpeed,
      totalTime: point.totalTime,
    })),
  }
}
