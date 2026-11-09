import type { WorkflowParameter, WorkflowScope } from '@shared/types.js'

export type { WorkflowParameter, WorkflowScope }

export interface WorkflowCondition {
  type: string
  result?: string
  key?: string
  field?: string
  value?: string
  values?: string[]
}

export interface WorkflowTransition {
  when: WorkflowCondition
  goto: string
  subGroup?: string
}

export interface ParallelChildStep {
  id: string
  type: 'sub_agent' | 'shell'
  subAgentType?: string
  prompt?: string
  command?: string
  timeout?: number
  successExitCodes?: number[]
}

export type StepType = 'agent' | 'sub_agent' | 'shell' | 'user' | 'parallel'

export interface WorkflowStep {
  id: string
  name: string
  type: StepType
  phase: string
  transitions: WorkflowTransition[]
  agentId?: string
  subAgentType?: string
  prompt?: string
  nudgePrompt?: string
  command?: string
  timeout?: number
  successExitCodes?: number[]
  subGroup?: string
  children?: ParallelChildStep[]
  maxConcurrency?: number
}

export interface WorkflowFull {
  metadata: {
    id: string
    name: string
    description: string
    version: string
    color?: string
    parameters?: WorkflowParameter[]
  }
  entryStep: string
  settings: { maxIterations: number }
  steps: WorkflowStep[]
  startCondition?: WorkflowCondition
}

export interface WorkflowInfo {
  id: string
  name: string
  description: string
  color?: string
}

export interface AgentRef {
  id: string
  name: string
  color?: string
  subagent?: boolean
  results?: string[]
}

export interface TemplateVariable {
  name: string
  description: string
}
