import type { WorkflowParameter } from '@shared/types.js'

/** What the composer's parameter dialog needs to ask, then do. */
export interface ParamRequest {
  name: string
  confirmLabel: string
  parameters: WorkflowParameter[]
  onConfirm: (values: Record<string, string>) => void
}

/** Everything to ask before a launch, or nothing if the workflow can start as it is. */
export function parametersToAsk(parameters: WorkflowParameter[] | undefined): WorkflowParameter[] {
  const list = parameters ?? []
  if (!list.some((parameter) => parameter.position !== undefined || parameter.required)) return []
  return [...list].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
}

export function allRequiredFilled(parameters: WorkflowParameter[], values: Record<string, string>): boolean {
  return parameters.every((parameter) => !parameter.required || (values[parameter.id]?.trim() ?? '') !== '')
}

export function collectValues(parameters: WorkflowParameter[], values: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    parameters.flatMap((parameter) => {
      const value = values[parameter.id]?.trim()
      return value ? [[parameter.id, value]] : []
    }),
  )
}

export function templateParams(template: string): string[] {
  return [...new Set([...template.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]!))]
}

export function fillTemplate(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{{${key}}}`, value), template)
}

export function withTypedText(typed: string, prompt: string): string {
  const text = typed.trim()
  return text ? `${text}\n\n${prompt}` : prompt
}

/** A command redefined in a narrower scope replaces the broader one. */
export function uniqueById<T extends { id: string }>(items: T[]): T[] {
  return [...new Map(items.map((item) => [item.id, item])).values()]
}
