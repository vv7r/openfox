/**
 * Fixed, deterministic LLM answer used by the mobile performance bench.
 *
 * The answer mixes what a coding agent really streams: headings, prose with
 * inline code and bold, bullet and numbered lists, a table and several fenced
 * code blocks in different languages. Sections are repeated (with their index
 * baked in) until the requested token count is reached, so every run streams
 * byte-identical content.
 *
 * Checkpoint words (`ckpt0001`, `ckpt0002`, ...) are sprinkled through the text.
 * They are plain alphanumerics, so markdown rendering never splits them, and the
 * bench can ask "is everything up to checkpoint N on screen yet?" by looking for
 * a single word in the DOM.
 */

/** First and last words of every answer: the bench waits on them. */
export const BEGIN_MARKER = 'perfbegin'
export const END_MARKER = 'perfend'

const CKPT = '{{ckpt}}'

function section(i: number): string {
  return `## ${i}. Streaming pipeline, part ${i} ${CKPT}

The client receives \`chat.delta\` frames over the WebSocket and appends them to a **per-session buffer**. The buffer is flushed once per animation frame, which keeps React renders bounded even when the backend emits tokens faster than the screen refreshes. ${CKPT}

Key points for part ${i}:

- Deltas are coalesced before they reach the store, so a burst of tokens costs a single render. ${CKPT}
- The message list only mounts the most recent items; older ones are revealed while scrolling up. ${CKPT}
- Finished messages are immutable and their parsed markdown is cached by content. ${CKPT}
- Code blocks are highlighted asynchronously with \`shiki\` once the block content is known. ${CKPT}

\`\`\`typescript
// ckpt marker ${CKPT}
export function coalesce${i}(buffer: string[], delta: string): string[] {
  const next = buffer.length > 0 ? [...buffer.slice(0, -1), buffer[buffer.length - 1] + delta] : [delta]
  if (next.join('').length > ${1000 + i * 17}) {
    return next.slice(-${4 + (i % 3)})
  }
  return next
}

export const FLUSH_INTERVAL_MS_${i} = ${16 + (i % 4)}
\`\`\`

1. Receive the frame and parse the JSON payload. ${CKPT}
2. Resolve the target pane for \`sessionId\` and append to its buffer. ${CKPT}
3. Schedule a flush on the next animation frame if none is pending. ${CKPT}
4. Render the updated message and keep the viewport pinned to the bottom. ${CKPT}

| Stage | Cost per token | Cost per frame | Notes |
| ----- | -------------- | -------------- | ----- |
| parse | low | none | JSON.parse of a small frame ${CKPT} |
| buffer | low | none | string concatenation |
| render | none | medium | one React commit per frame |
| layout | none | medium | depends on the mounted DOM size ${CKPT} |

\`\`\`python
# ckpt marker ${CKPT}
def summarize_part_${i}(samples: list[float]) -> dict[str, float]:
    ordered = sorted(samples)
    count = len(ordered)
    if count == 0:
        return {"count": 0, "p50": 0.0, "p95": 0.0}
    return {
        "count": count,
        "p50": ordered[count // 2],
        "p95": ordered[min(count - 1, int(count * 0.95))],
    }
\`\`\`

> Note for part ${i}: the numbers above are illustrative. The bench measures the real cost on a throttled CPU, which is what a phone actually experiences. ${CKPT}

\`\`\`bash
# ckpt marker ${CKPT}
npm run perf -- --runs 3
npm run perf:compare -- perf-results/before.json perf-results/after.json
\`\`\`

\`\`\`json
{ "part": ${i}, "tokensPerSecond": 100, "cpuThrottle": 4, "marker": "${CKPT}" }
\`\`\`

With these pieces in place, part ${i} is done and the next part builds on it. ${CKPT}

`
}

/** One finished answer section without checkpoint words, for pre-built history. */
export function sectionMarkdown(i: number): string {
  return section(i).replaceAll(` ${CKPT}`, '').replaceAll(CKPT, '')
}

/**
 * Split text into streaming chunks: each chunk is one word plus the whitespace
 * that precedes it, which is close to how BPE tokenizers cut English prose and
 * keeps newlines attached to the following word.
 */
export function tokenize(text: string): string[] {
  return text.match(/\s*\S+|\s+$/g) ?? []
}

export interface PerfAnswer {
  text: string
  tokens: string[]
  /** For each token index, the last checkpoint number fully emitted (0 = none yet). */
  checkpointAt: number[]
}

export function checkpointWord(n: number): string {
  return `ckpt${String(n).padStart(4, '0')}`
}

/** Build a deterministic answer of at least `targetTokens` chunks. */
export function buildAnswer(targetTokens: number): PerfAnswer {
  let body = ''
  let part = 1
  while (tokenize(body).length < targetTokens) {
    body += section(part++)
  }
  let n = 0
  const withCheckpoints = body.replaceAll(CKPT, () => checkpointWord(++n))
  const text = `${BEGIN_MARKER} Here is the full walkthrough.\n\n${withCheckpoints}Done. ${END_MARKER}\n`
  const tokens = tokenize(text)
  const checkpointAt: number[] = []
  let last = 0
  for (const token of tokens) {
    const match = /ckpt(\d{4})/.exec(token)
    if (match?.[1]) last = Number(match[1])
    checkpointAt.push(last)
  }
  return { text, tokens, checkpointAt }
}
