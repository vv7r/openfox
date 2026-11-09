import { describe, expect, it } from 'vitest'
import {
  addParallelChild,
  addTransition,
  buildWorkflow,
  changeStepType,
  conditionForType,
  conditionLabel,
  emptyDraft,
  moveSource,
  moveTransition,
  nextStepId,
  parseEdgeKey,
  patchParallelChild,
  removeStep,
  removeTransition,
  retarget,
  validateDraft,
  type Draft,
} from './editing'
import type { WorkflowStep } from './types'

const step = (id: string, over: Partial<WorkflowStep> = {}): WorkflowStep => ({
  id,
  name: id,
  type: 'agent',
  phase: 'build',
  agentId: 'builder',
  transitions: [],
  ...over,
})

const always = { when: { type: 'always' }, goto: '$done' }

describe('ids and keys', () => {
  it('fills the first free step id', () => {
    expect(nextStepId([step('s1'), step('s3')])).toBe('s2')
  })

  it('parses an edge key, keeping colons in step ids', () => {
    expect(parseEdgeKey('a:b:2')).toEqual({ stepId: 'a:b', index: 2 })
    expect(parseEdgeKey('start')).toBeNull()
  })
})

describe('conditions', () => {
  it('starts each type with the right fields', () => {
    expect(conditionForType('step_result')).toEqual({ type: 'step_result', result: 'success' })
    expect(conditionForType('metadata_all_in')).toEqual({ type: 'metadata_all_in', key: '', field: '', values: [] })
    expect(conditionForType('always')).toEqual({ type: 'always' })
  })

  it('labels conditions for the diagram', () => {
    expect(conditionLabel({ type: 'step_result', result: 'failed' })).toBe('failed')
    expect(conditionLabel({ type: 'metadata_all_match', key: 'k', value: 'v' })).toBe('k=v')
    expect(conditionLabel({ type: 'metadata_all_in', key: 'k', values: ['a', 'b'] })).toBe('k in [a,b]')
    expect(conditionLabel({ type: 'always' })).toBe('otherwise')
  })
})

describe('transitions', () => {
  const steps = [step('a', { transitions: [always, { when: { type: 'always' }, goto: 'b' }] }), step('b')]

  it('adds one and returns its key', () => {
    const result = addTransition(steps, 'b', 'a')
    expect(result.edgeKey).toBe('b:0')
    expect(result.steps[1]!.transitions[0]).toEqual({ when: { type: 'always' }, goto: 'a' })
  })

  it('retargets', () => {
    expect(retarget(steps, 'a:0', 'b')[0]!.transitions[0]!.goto).toBe('b')
  })

  it('moves to another source', () => {
    const moved = moveSource(steps, 'a:1', 'b')
    expect(moved[0]!.transitions).toHaveLength(1)
    expect(moved[1]!.transitions[0]!.goto).toBe('b')
  })

  it('removes', () => {
    expect(removeTransition(steps, 'a:0')[0]!.transitions.map((item) => item.goto)).toEqual(['b'])
  })

  it('reorders and follows the moved edge, within bounds', () => {
    const result = moveTransition(steps, 'a:0', 1)
    expect(result.steps[0]!.transitions.map((item) => item.goto)).toEqual(['b', '$done'])
    expect(result.edgeKey).toBe('a:1')
    expect(moveTransition(steps, 'a:0', -1).steps).toBe(steps)
  })
})

describe('removeStep', () => {
  const draft: Draft = {
    ...emptyDraft(),
    entryStep: 'a',
    steps: [step('a', { transitions: [{ when: { type: 'always' }, goto: 'b' }] }), step('b')],
  }

  it('moves the entry and drops transitions pointing at the removed step', () => {
    const next = removeStep(draft, 'b')
    expect(next.steps.map((item) => item.id)).toEqual(['a'])
    expect(next.steps[0]!.transitions).toEqual([])
    expect(removeStep(draft, 'a').entryStep).toBe('b')
  })
})

describe('changeStepType', () => {
  const agents = [
    { id: 'builder', name: 'Builder' },
    { id: 'verifier', name: 'Verifier', subagent: true },
  ]

  it('picks a matching agent and phase', () => {
    expect(changeStepType(step('a'), 'sub_agent', agents)).toMatchObject({
      type: 'sub_agent',
      phase: 'verification',
      subAgentType: 'verifier',
      name: 'Verifier',
    })
  })

  it('drops other types fields when becoming parallel', () => {
    const next = changeStepType(step('a', { prompt: 'x', command: 'y' }), 'parallel', agents)
    expect(next).toMatchObject({ type: 'parallel', children: [] })
    expect(next).not.toHaveProperty('prompt')
    expect(next).not.toHaveProperty('agentId')
  })

  it('drops parallel fields when leaving', () => {
    const next = changeStepType(step('a', { type: 'parallel', children: [], maxConcurrency: 2 }), 'shell', agents)
    expect(next).not.toHaveProperty('children')
    expect(next).not.toHaveProperty('maxConcurrency')
  })
})

describe('parallel children', () => {
  const parallel = step('p', {
    type: 'parallel',
    children: [
      { id: 'child-1', type: 'shell', command: 'ls' },
      { id: 'other', type: 'sub_agent', subAgentType: 'v' },
    ],
  })

  it('numbers new children after existing ones', () => {
    expect(addParallelChild(parallel).children![2]!.id).toBe('child-2')
  })

  it('slugifies a rename and resolves collisions', () => {
    expect(patchParallelChild(parallel, 0, { id: 'My Check!' }).children![0]!.id).toBe('my-check')
    expect(patchParallelChild(parallel, 0, { id: 'other' }).children![0]!.id).toBe('other-2')
  })

  it('forgets the previous type fields on a switch', () => {
    expect(patchParallelChild(parallel, 0, { type: 'sub_agent' }).children![0]).toEqual({
      id: 'child-1',
      type: 'sub_agent',
      subAgentType: '',
    })
  })
})

describe('validateDraft and buildWorkflow', () => {
  const valid: Draft = { ...emptyDraft(), id: 'w', name: 'W', entryStep: 's1', steps: [step('s1')] }

  it('accepts a complete draft', () => {
    expect(validateDraft(valid)).toBeNull()
  })

  it('needs a name, a step and valid parameter ids', () => {
    expect(validateDraft({ ...valid, name: '' })).not.toBeNull()
    expect(validateDraft({ ...valid, steps: [] })).not.toBeNull()
    expect(validateDraft({ ...valid, parameters: [{ id: '1 bad', label: '' }] })).not.toBeNull()
  })

  it('falls back to the first step when the entry is gone', () => {
    expect(buildWorkflow({ ...valid, entryStep: 'nope' }, 'w').entryStep).toBe('s1')
  })

  it('leaves out empty parameters', () => {
    expect(buildWorkflow(valid, 'w').metadata).not.toHaveProperty('parameters')
  })
})
