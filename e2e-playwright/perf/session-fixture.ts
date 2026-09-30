/**
 * Pre-built history for the long-session scenario: ~200 messages alternating
 * user prompts and assistant answers with markdown, code blocks and tool calls.
 * Deterministic, so every run renders the same thing.
 */

import type { Message, ToolCall } from '../../src/shared/types.js'
import { sectionMarkdown } from './fixture.js'

/** Word in the very last message: the scenario waits for it to be on screen. */
export const LAST_MESSAGE_MARKER = 'lastmsgmarker'

function toolCalls(turn: number): ToolCall[] {
  if (turn % 2 === 1) return []
  return [
    {
      id: `perf-read-${turn}`,
      name: 'read_file',
      arguments: { path: `src/feature/part-${turn}.ts` },
      result: {
        success: true,
        output: Array.from(
          { length: 40 },
          (_, line) => `${line + 1}| export const value${turn}_${line} = ${line}`,
        ).join('\n'),
        durationMs: 3,
        truncated: false,
      },
    },
    {
      id: `perf-run-${turn}`,
      name: 'run_command',
      arguments: { command: `npm test -- part-${turn}` },
      result: {
        success: true,
        output: `> vitest run part-${turn}\n\n ✓ part-${turn}.test.ts (12 tests) 48ms\n\n Test Files  1 passed (1)\n      Tests  12 passed (12)\n`,
        durationMs: 1200,
        truncated: false,
      },
    },
  ]
}

export function buildLongSession(messageCount = 200): Message[] {
  const messages: Message[] = []
  const base = Date.UTC(2026, 0, 1)
  for (let turn = 0; messages.length < messageCount; turn++) {
    const isLast = messages.length + 2 >= messageCount
    messages.push({
      id: `perf-user-${turn}`,
      role: 'user',
      content: `Please continue with part ${turn} of the streaming refactor and run the tests.`,
      timestamp: new Date(base + messages.length * 1000).toISOString(),
    })
    messages.push({
      id: `perf-assistant-${turn}`,
      role: 'assistant',
      content: `${sectionMarkdown(turn + 1)}${isLast ? `\nAll parts are done. ${LAST_MESSAGE_MARKER}\n` : ''}`,
      toolCalls: toolCalls(turn),
      timestamp: new Date(base + messages.length * 1000).toISOString(),
      isStreaming: false,
      completeReason: 'complete',
    })
  }
  return messages
}
