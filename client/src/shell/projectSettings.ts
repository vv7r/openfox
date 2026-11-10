import { getJson } from '../api'

export type McpOverride = { disabled?: boolean; disabledTools?: string[] }
export type McpOverrides = Record<string, McpOverride>

/** The setup field is one line; the server stores one command per step. */
export function splitSetup(text: string): string[] {
  return text
    .split('&&')
    .map((command) => command.trim())
    .filter(Boolean)
}

export const joinSetup = (setup: string[] | undefined): string => (setup ?? []).join(' && ')

export function toggleServerOverride(overrides: McpOverrides, name: string, disabled: boolean): McpOverrides {
  return { ...overrides, [name]: { ...overrides[name], disabled } }
}

export function toggleToolOverride(overrides: McpOverrides, server: string, tool: string): McpOverrides {
  const { disabledTools = [], ...rest } = overrides[server] ?? {}
  const next = disabledTools.includes(tool) ? disabledTools.filter((name) => name !== tool) : [...disabledTools, tool]
  return { ...overrides, [server]: { ...rest, ...(next.length > 0 ? { disabledTools: next } : {}) } }
}

export interface WorkspaceConfig {
  setup?: string[]
  rootDir?: string
  mcpOverrides?: McpOverrides
}

export async function loadWorkspaceConfig(workdir: string): Promise<WorkspaceConfig> {
  const data = await getJson<{ config: WorkspaceConfig | null }>(
    `/api/workspace/config?workdir=${encodeURIComponent(workdir)}`,
  ).catch(() => null)
  return data?.config ?? {}
}
