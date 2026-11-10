// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { prettyJson, readableReminder } from './systemText'

describe('readableReminder', () => {
  it('drops the wrapper tags the model reads', () => {
    expect(readableReminder('<system-reminder>\n# Plan Mode\n\nRead only.\n</system-reminder>')).toBe(
      '# Plan Mode\n\nRead only.',
    )
  })

  it('keeps a tag named in the text visible as code', () => {
    expect(readableReminder('<system-reminder>\nwait for a new <system-reminder> first\n</system-reminder>')).toBe(
      'wait for a new `<system-reminder>` first',
    )
  })

  it('leaves plain text alone', () => {
    expect(readableReminder('Reminder: you are in Planner mode.')).toBe('Reminder: you are in Planner mode.')
  })
})

describe('prettyJson', () => {
  it('indents JSON output', () => {
    expect(prettyJson('{"a":1,"b":[2]}')).toBe('{\n  "a": 1,\n  "b": [\n    2\n  ]\n}')
  })

  it('returns anything else as it came', () => {
    expect(prettyJson('plain text')).toBe('plain text')
    expect(prettyJson('42')).toBe('42')
  })
})
