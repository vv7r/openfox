import type { Translation } from '@shared/i18n/index.js'
import { t } from '../../i18n'
import type {
  AgentRef,
  ParallelChildStep,
  StepType,
  WorkflowCondition,
  WorkflowFull,
  WorkflowParameter,
  WorkflowStep,
} from './types'

export interface Draft {
  id: string
  name: string
  description: string
  version: string
  color: string
  entryStep: string
  maxIterations: number
  steps: WorkflowStep[]
  startCondition: WorkflowCondition
  parameters: WorkflowParameter[]
  destination: 'user' | 'project'
}

export function emptyDraft(): Draft {
  return {
    id: '',
    name: '',
    description: '',
    version: '1.0.0',
    color: '#3b82f6',
    entryStep: '',
    maxIterations: 50,
    steps: [],
    startCondition: { type: 'always' },
    parameters: [],
    destination: 'user',
  }
}

export function draftFrom(workflow: WorkflowFull): Draft {
  return {
    ...emptyDraft(),
    id: workflow.metadata.id,
    name: workflow.metadata.name,
    description: workflow.metadata.description,
    version: workflow.metadata.version,
    color: workflow.metadata.color ?? '#3b82f6',
    entryStep: workflow.entryStep,
    maxIterations: workflow.settings.maxIterations,
    steps: workflow.steps,
    startCondition: workflow.startCondition ?? { type: 'always' },
    parameters: workflow.metadata.parameters ?? [],
  }
}

export function nextStepId(steps: WorkflowStep[]): string {
  let index = 1
  while (steps.some((step) => step.id === `s${index}`)) index++
  return `s${index}`
}

export function parseEdgeKey(edgeKey: string): { stepId: string; index: number } | null {
  if (edgeKey === 'start') return null
  const separator = edgeKey.lastIndexOf(':')
  return { stepId: edgeKey.slice(0, separator), index: Number(edgeKey.slice(separator + 1)) }
}

export function conditionForType(type: string): WorkflowCondition {
  if (type === 'step_result') return { type, result: 'success' }
  if (type === 'metadata_all_match') return { type, key: '', field: '', value: '' }
  if (type === 'metadata_all_in') return { type, key: '', field: '', values: [] }
  return { type }
}

export function conditionLabel(condition: WorkflowCondition): string {
  switch (condition.type) {
    case 'step_result':
      return String(condition.result)
    case 'metadata_all_match':
      return `${condition.key ?? '?'}=${condition.value ?? '?'}`
    case 'metadata_all_in':
      return `${condition.key ?? '?'} in [${condition.values?.join(',') ?? '?'}]`
    case 'always':
      return 'otherwise'
    default:
      return condition.type
  }
}

export function addTransition(
  steps: WorkflowStep[],
  from: string,
  to: string,
): { steps: WorkflowStep[]; edgeKey: string } {
  const index = steps.find((step) => step.id === from)?.transitions.length ?? 0
  return {
    edgeKey: `${from}:${index}`,
    steps: steps.map((step) =>
      step.id === from ? { ...step, transitions: [...step.transitions, { when: { type: 'always' }, goto: to }] } : step,
    ),
  }
}

/** Replaces one transition, or leaves the steps alone if the key is stale. */
export function updateTransition(
  steps: WorkflowStep[],
  edgeKey: string,
  update: (transition: WorkflowStep['transitions'][number]) => WorkflowStep['transitions'][number],
): WorkflowStep[] {
  const parsed = parseEdgeKey(edgeKey)
  if (!parsed) return steps
  return steps.map((step) =>
    step.id === parsed.stepId
      ? {
          ...step,
          transitions: step.transitions.map((item, index) => (index === parsed.index ? update(item) : item)),
        }
      : step,
  )
}

export function retarget(steps: WorkflowStep[], edgeKey: string, goto: string): WorkflowStep[] {
  return updateTransition(steps, edgeKey, (item) => ({ ...item, goto }))
}

export function removeTransition(steps: WorkflowStep[], edgeKey: string): WorkflowStep[] {
  const parsed = parseEdgeKey(edgeKey)
  if (!parsed) return steps
  return steps.map((step) =>
    step.id === parsed.stepId
      ? { ...step, transitions: step.transitions.filter((_, index) => index !== parsed.index) }
      : step,
  )
}

export function moveSource(steps: WorkflowStep[], edgeKey: string, newSource: string): WorkflowStep[] {
  const parsed = parseEdgeKey(edgeKey)
  const moved = parsed && steps.find((step) => step.id === parsed.stepId)?.transitions[parsed.index]
  if (!moved) return steps
  return removeTransition(steps, edgeKey).map((step) =>
    step.id === newSource ? { ...step, transitions: [...step.transitions, moved] } : step,
  )
}

/** Order is evaluation priority. */
export function moveTransition(
  steps: WorkflowStep[],
  edgeKey: string,
  delta: -1 | 1,
): { steps: WorkflowStep[]; edgeKey: string } {
  const parsed = parseEdgeKey(edgeKey)
  const step = parsed && steps.find((item) => item.id === parsed.stepId)
  if (!parsed || !step) return { steps, edgeKey }
  const target = parsed.index + delta
  if (target < 0 || target >= step.transitions.length) return { steps, edgeKey }
  const transitions = [...step.transitions]
  ;[transitions[parsed.index], transitions[target]] = [transitions[target]!, transitions[parsed.index]!]
  return {
    edgeKey: `${step.id}:${target}`,
    steps: steps.map((item) => (item.id === step.id ? { ...item, transitions } : item)),
  }
}

export function removeStep(draft: Draft, id: string): Draft {
  const steps = draft.steps
    .filter((step) => step.id !== id)
    .map((step) => ({ ...step, transitions: step.transitions.filter((item) => item.goto !== id) }))
  return { ...draft, steps, entryStep: draft.entryStep === id ? (steps[0]?.id ?? '') : draft.entryStep }
}

export function changeStepType(step: WorkflowStep, type: StepType, agents: AgentRef[]): WorkflowStep {
  const phase = type === 'sub_agent' ? 'verification' : 'build'
  let next: WorkflowStep = { ...step, type, phase }
  if (type === 'agent') {
    const agent = agents.find((item) => !item.subagent)
    next = { ...next, agentId: agent?.id ?? 'builder', name: agent?.name ?? t({ en: 'Agent', fr: 'Agent' }) }
  } else if (type === 'sub_agent') {
    const agent = agents.find((item) => item.subagent)
    next = { ...next, subAgentType: agent?.id ?? '', name: agent?.name ?? t({ en: 'Sub-agent', fr: 'Sous-agent' }) }
  } else if (type === 'user') {
    next = { ...next, name: t({ en: 'User', fr: 'Utilisateur' }) }
  } else if (type === 'shell') {
    next = { ...next, name: t({ en: 'Shell', fr: 'Shell' }) }
  } else {
    next = { ...next, name: t({ en: 'Parallel', fr: 'Parallèle' }), children: step.children ?? [] }
    for (const field of ['agentId', 'subAgentType', 'prompt', 'command', 'timeout', 'successExitCodes'] as const) {
      delete next[field]
    }
  }
  if (step.type === 'parallel' && type !== 'parallel') {
    delete next.children
    delete next.maxConcurrency
  }
  return next
}

export function addParallelChild(step: WorkflowStep): WorkflowStep {
  const children = step.children ?? []
  const taken = new Set(children.map((child) => child.id))
  let index = 1
  while (taken.has(`child-${index}`)) index++
  return { ...step, children: [...children, { id: `child-${index}`, type: 'shell', command: '' }] }
}

function slugifyChild(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export function patchParallelChild(step: WorkflowStep, index: number, patch: Partial<ParallelChildStep>): WorkflowStep {
  const children = [...(step.children ?? [])]
  const child = children[index]
  if (!child) return step
  let next: ParallelChildStep = { ...child, ...patch }
  if (patch.id !== undefined && patch.id !== child.id) {
    // Children are addressed by id in step outputs: keep it a unique slug
    const slug = slugifyChild(patch.id) || `child-${index + 1}`
    const others = children.filter((_, position) => position !== index).map((item) => item.id)
    let id = slug
    for (let suffix = 2; others.includes(id); suffix++) id = `${slug}-${suffix}`
    next = { ...next, id }
  }
  if (patch.type !== undefined && patch.type !== child.type) {
    next =
      patch.type === 'shell'
        ? { id: next.id, type: 'shell', command: next.command ?? '' }
        : { id: next.id, type: 'sub_agent', subAgentType: next.subAgentType ?? '' }
  }
  children[index] = next
  return { ...step, children }
}

const PARAMETER_ID = /^[a-zA-Z_][a-zA-Z0-9_]*$/

export function validateDraft(draft: Draft): Translation | null {
  if (!draft.id || !draft.name) return { en: 'Name is required.', fr: 'Le nom est requis.' }
  if (draft.steps.length === 0) return { en: 'Add at least one step.', fr: 'Ajoutez au moins une étape.' }
  if (draft.parameters.some((parameter) => !PARAMETER_ID.test(parameter.id))) {
    return {
      en: 'Parameter IDs use letters, digits and underscores only.',
      fr: 'Les ID de paramètres n’utilisent que des lettres, chiffres et tirets bas.',
    }
  }
  return null
}

export function buildWorkflow(draft: Draft, id: string): WorkflowFull {
  const entryStep = draft.steps.some((step) => step.id === draft.entryStep)
    ? draft.entryStep
    : (draft.steps[0]?.id ?? '')
  return {
    metadata: {
      id,
      name: draft.name,
      description: draft.description,
      version: draft.version || '1.0.0',
      color: draft.color,
      ...(draft.parameters.length > 0 ? { parameters: draft.parameters } : {}),
    },
    entryStep,
    settings: { maxIterations: draft.maxIterations },
    steps: draft.steps,
    startCondition: draft.startCondition,
  }
}
