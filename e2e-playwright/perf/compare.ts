/**
 * Before/after table between two mobile perf bench results (medians).
 *
 * Usage:
 *   npm run perf:compare -- perf-results/before.json perf-results/after.json
 *   npm run perf:compare -- before.json after.json --renders   # include per-component render counts
 */

import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { parseArgs } from 'node:util'
import { compareMetrics, formatComparisonTable, type Metrics } from './stats.js'

interface Report {
  branch: string
  label?: string | null
  commit: string
  median: Metrics
}

async function load(path: string): Promise<Report> {
  return JSON.parse(await readFile(path, 'utf-8')) as Report
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { renders: { type: 'boolean', default: false } },
  })
  const [beforePath, afterPath] = positionals
  if (!beforePath || !afterPath) {
    console.error('Usage: npm run perf:compare -- <before.json> <after.json> [--renders]')
    process.exit(1)
  }
  const [before, after] = await Promise.all([load(beforePath), load(afterPath)])
  const rows = compareMetrics(before.median, after.median).filter(
    (row) => values.renders || !row.metric.includes('.react.renders.'),
  )
  const name = (report: Report, path: string) =>
    report.commit ? `${report.label ?? report.branch} (${report.commit})` : basename(path)
  console.log(formatComparisonTable(rows, name(before, beforePath), name(after, afterPath)))
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
