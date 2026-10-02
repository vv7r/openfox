/**
 * Scripted multi-step turns for the mock LLM: each request of the turn gets the
 * answer for its step (the number of tool results since the prompt), so the
 * real agent loop runs, executes the tools and comes back, exactly as with a
 * real model, but byte-identical on every run.
 *
 *   - seed:  read_file calls on large files, to give a session a long history
 *            (tool results) before a scenario runs in it.
 *   - agent: per step, thinking tokens, a short text, then a write_file call
 *            whose arguments stream in. Models what a coding agent does for
 *            minutes: the per-token event writes, tool calls and growing log.
 */

/** One OpenAI streaming delta (`choices[0].delta`). */
export type StreamDelta = Record<string, unknown>

export interface ScriptedAnswer {
  deltas: StreamDelta[]
  finish: 'stop' | 'tool_calls'
}

/** Answer for one step of a scripted turn. */
export type TurnScript = (step: number) => ScriptedAnswer

const WORDS =
  'the module handles loans returns and late fees with clear validation then writes the tests for each case'.split(' ')

/** Tokens a seed file stands for (~4 characters per token). */
export const SEED_FILE_TOKENS = 2000

/** Deterministic source file of about SEED_FILE_TOKENS tokens. */
export function seedFileContent(index: number): string {
  const lines: string[] = []
  for (let line = 0; lines.join('\n').length < SEED_FILE_TOKENS * 4; line++) {
    lines.push(`export function part${index}_${line}(value: number): number {`)
    lines.push(`  return value * ${line + 1} + ${index} // ${WORDS[(line + index) % WORDS.length]}`)
    lines.push('}')
  }
  return lines.join('\n')
}

export function seedFilePath(index: number): string {
  return `seed/part-${String(index).padStart(3, '0')}.ts`
}

/** Number of seed files (read_file steps) that make up `tokens` of history. */
export function seedFileCount(tokens: number): number {
  return Math.ceil(tokens / SEED_FILE_TOKENS)
}

function words(count: number, offset = 0): StreamDelta[] {
  return Array.from({ length: count }, (_, i) => ({ content: `${WORDS[(i + offset) % WORDS.length]} ` }))
}

function toolCall(step: number, name: string, args: Record<string, unknown>, chunkSize: number): StreamDelta[] {
  const json = JSON.stringify(args)
  const deltas: StreamDelta[] = [
    { tool_calls: [{ index: 0, id: `call_${name}_${step}`, type: 'function', function: { name, arguments: '' } }] },
  ]
  for (let i = 0; i < json.length; i += chunkSize) {
    deltas.push({ tool_calls: [{ index: 0, function: { arguments: json.slice(i, i + chunkSize) } }] })
  }
  return deltas
}

/** read_file on each seed file in turn, then a short summary. */
export function seedScript(files: number): TurnScript {
  return (step) => {
    if (step >= files) return { deltas: words(60), finish: 'stop' }
    return {
      deltas: [...words(12, step), ...toolCall(step, 'read_file', { path: seedFilePath(step) }, 1000)],
      finish: 'tool_calls',
    }
  }
}

/** Python-ish file the agent writes at a step (~4 KB). */
function agentFileContent(step: number): string {
  return Array.from(
    { length: 110 },
    (_, i) => `def function_${step}_${i}(value):\n    return value * ${i} + ${step}  # line ${i}`,
  )
    .join('\n')
    .slice(0, 4000)
}

/** `steps` steps of thinking + text + streamed write_file, then a final answer. */
export function agentScript(steps: number, thinkTokens: number): TurnScript {
  return (step) => {
    if (step >= steps) return { deltas: words(300), finish: 'stop' }
    const thinking: StreamDelta[] = Array.from({ length: thinkTokens }, (_, i) => ({
      reasoning_content: `${WORDS[(i + step) % WORDS.length]}${i % 17 === 16 ? '.\n' : ' '}`,
    }))
    return {
      deltas: [
        ...thinking,
        ...words(12, step),
        // Streamed arguments arrive in small chunks, like a real model's tokens.
        ...toolCall(step, 'write_file', { path: `out/mod_${step}.py`, content: agentFileContent(step) }, 16),
      ],
      finish: 'tool_calls',
    }
  }
}
