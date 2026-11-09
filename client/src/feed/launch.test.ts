import { describe, expect, it } from 'vitest'
import {
  allRequiredFilled,
  collectValues,
  fillTemplate,
  parametersToAsk,
  templateParams,
  uniqueById,
  withTypedText,
} from './launch'

const param = (id: string, extra: { position?: number; required?: boolean } = {}) => ({ id, label: id, ...extra })

describe('parametersToAsk', () => {
  it('asks nothing when no parameter is positional or required', () => {
    expect(parametersToAsk(undefined)).toEqual([])
    expect(parametersToAsk([param('free')])).toEqual([])
  })

  it('asks every parameter, in position order, as soon as one needs it', () => {
    const asked = parametersToAsk([param('b', { position: 1 }), param('a', { position: 0 }), param('c')])
    expect(asked.map((p) => p.id)).toEqual(['a', 'c', 'b'])
  })

  it('asks for a required parameter without a position', () => {
    expect(parametersToAsk([param('a', { required: true })]).map((p) => p.id)).toEqual(['a'])
  })
})

describe('allRequiredFilled', () => {
  const parameters = [param('a', { required: true }), param('b')]

  it('needs a non-blank value for each required parameter', () => {
    expect(allRequiredFilled(parameters, {})).toBe(false)
    expect(allRequiredFilled(parameters, { a: '   ' })).toBe(false)
    expect(allRequiredFilled(parameters, { a: 'x' })).toBe(true)
  })
})

describe('collectValues', () => {
  it('trims values and leaves out the blank ones', () => {
    expect(collectValues([param('a'), param('b'), param('c')], { a: ' x ', b: '  ' })).toEqual({ a: 'x' })
  })
})

describe('templateParams', () => {
  it('lists each placeholder once, in order of appearance', () => {
    expect(templateParams('{{b}} and {{a}} then {{b}}')).toEqual(['b', 'a'])
  })
  it('finds nothing in plain text', () => expect(templateParams('no placeholder')).toEqual([]))
})

describe('fillTemplate', () => {
  it('replaces every occurrence and leaves unknown placeholders', () => {
    expect(fillTemplate('{{a}} {{a}} {{b}}', { a: 'x' })).toBe('x x {{b}}')
  })
})

describe('withTypedText', () => {
  it('puts what the user typed before the command', () => {
    expect(withTypedText(' note ', 'prompt')).toBe('note\n\nprompt')
  })
  it('sends the command alone when nothing was typed', () => expect(withTypedText('  ', 'prompt')).toBe('prompt'))
})

describe('uniqueById', () => {
  it('lets the later scope win, at the place of the first', () => {
    const items = [
      { id: 'a', name: 'builtin' },
      { id: 'b', name: 'other' },
      { id: 'a', name: 'project' },
    ]
    expect(uniqueById(items)).toEqual([
      { id: 'a', name: 'project' },
      { id: 'b', name: 'other' },
    ])
  })
})
