import type { SessionSummary } from '@shared/types.js'

/** Every word of the query must appear, letters in order, inside one word of the text. */
export function fuzzyMatch(text: string, query: string): boolean {
  const words = text.toLowerCase().split(/\s+/)
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((part) =>
      words.some((word) => {
        let found = 0
        for (const letter of word) {
          if (letter === part[found]) found++
          if (found === part.length) return true
        }
        return false
      }),
    )
}

export interface SessionHit {
  session: SessionSummary
  snippet: string | null
}

const SNIPPET_MARGIN = 30
const TITLE_SCORE = 10
const PROMPT_SCORE = 3
const PROJECT_SCORE = 1

function snippetOf(prompt: string, query: string): string {
  const at = prompt.toLowerCase().indexOf(query.toLowerCase())
  if (at < 0) return prompt.length > 80 ? `${prompt.slice(0, 80)}…` : prompt
  const start = Math.max(0, at - SNIPPET_MARGIN)
  const end = Math.min(prompt.length, at + query.length + SNIPPET_MARGIN)
  return `${start > 0 ? '…' : ''}${prompt.slice(start, end)}${end < prompt.length ? '…' : ''}`
}

/** Title matches first, then prompts, then project name; ties go to the most recent. */
export function searchSessions(
  sessions: SessionSummary[],
  query: string,
  projectName: (projectId: string) => string,
): SessionHit[] {
  const scored = sessions.flatMap((session) => {
    const prompts = session.recentUserPrompts?.map((prompt) => prompt.content) ?? []
    const prompt = prompts.find((content) => fuzzyMatch(content, query))
    const score =
      (fuzzyMatch(session.title ?? '', query) ? TITLE_SCORE : 0) +
      (prompt === undefined ? 0 : PROMPT_SCORE) +
      (fuzzyMatch(projectName(session.projectId), query) ? PROJECT_SCORE : 0)
    return score > 0 ? [{ session, score, snippet: prompt === undefined ? null : snippetOf(prompt, query) }] : []
  })
  scored.sort(
    (a, b) => b.score - a.score || new Date(b.session.updatedAt).getTime() - new Date(a.session.updatedAt).getTime(),
  )
  return scored.map(({ session, snippet }) => ({ session, snippet }))
}
