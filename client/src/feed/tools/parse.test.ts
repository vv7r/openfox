import { describe, expect, it } from 'vitest'
import type { EditContextRegion } from '@shared/types.js'
import {
  buildEditorUrl,
  extractCommand,
  fencedCode,
  groupSections,
  isMetadataPreparing,
  metadataLabel,
  parseAnsi,
  parseMetadataArgs,
  parseTaskView,
  readFileStartLine,
  stripReadNumbers,
} from './parse'

describe('parseAnsi', () => {
  it('keeps plain text whole', () => {
    expect(parseAnsi('hello')).toEqual([{ text: 'hello' }])
  })

  it('tracks color and bold until a reset', () => {
    expect(parseAnsi('\x1b[1;31mfail\x1b[0m ok')).toEqual([{ text: 'fail', color: 31, bold: true }, { text: ' ok' }])
  })

  it('removes other control sequences', () => {
    expect(parseAnsi('a\x1b[2Kb\x1b[?25l')).toEqual([{ text: 'ab' }])
  })

  it('turns one attribute off without touching the others', () => {
    expect(parseAnsi('\x1b[1;32mx\x1b[39my')).toEqual([
      { text: 'x', color: 32, bold: true },
      { text: 'y', bold: true },
    ])
  })
})

describe('fencedCode', () => {
  it('uses a fence longer than any run of backticks in the code', () => {
    expect(fencedCode('a ```` b', 'ts')).toBe('`````ts nofold\na ```` b\n`````')
    expect(fencedCode('plain', 'ts')).toBe('```ts nofold\nplain\n```')
  })
})

describe('read_file output', () => {
  const output = '12|first\n13|second\n[truncated]'

  it('removes numbers and trailing notes', () => {
    expect(stripReadNumbers(output)).toBe('first\nsecond')
  })

  it('finds where the excerpt starts', () => {
    expect(readFileStartLine(output)).toBe(12)
    expect(readFileStartLine('no numbers')).toBe(1)
  })
})

describe('groupSections', () => {
  const region = {
    startLine: 9,
    endLine: 12,
    beforeContext: [{ lineNumber: 9, content: 'a' }],
    afterContext: [{ lineNumber: 11, content: 'z' }],
    edits: [{ startLine: 10, endLine: 10, oldContent: 'old', newContent: 'new1\nnew2' }],
  } as unknown as EditContextRegion

  it('orders context, removed, added, context', () => {
    expect(groupSections(region)).toEqual([
      { type: 'context', startLine: 9, lines: ['a'] },
      { type: 'removed', startLine: 10, lines: ['old'] },
      { type: 'added', startLine: 10, lines: ['new1', 'new2'] },
      { type: 'context', startLine: 11, lines: ['z'] },
    ])
  })
})

describe('extractCommand', () => {
  it('reads a complete or partial argument string', () => {
    expect(extractCommand('{"command":"ls -la"}')).toBe('ls -la')
    expect(extractCommand('{"command":"ls -l')).toBe('ls -l')
    expect(extractCommand('{"timeout":1}')).toBeNull()
  })
})

describe('session_metadata arguments', () => {
  it('parses complete and partial JSON', () => {
    expect(parseMetadataArgs('{"action":"add","key":"todos","description":"x"}')).toEqual({
      action: 'add',
      key: 'todos',
      description: 'x',
    })
    expect(parseMetadataArgs('{"action":"add","key":"crit')).toEqual({ action: 'add', key: 'crit' })
  })

  it('recognises an add in flight', () => {
    expect(isMetadataPreparing({ index: 0, name: 'session_metadata', arguments: '{"action":"add","key":"x"' })).toBe(
      true,
    )
    expect(isMetadataPreparing({ index: 0, name: 'session_metadata', arguments: '{"action":"get","key":"x"' })).toBe(
      false,
    )
    expect(isMetadataPreparing({ index: 0, name: 'other', arguments: '{"action":"add","key":"x"' })).toBe(false)
  })

  it('labels keys, without trusting prototype names', () => {
    expect(metadataLabel('review_findings')).toBe('Review Findings')
    expect(metadataLabel('constructor')).toBe('Constructor')
  })
})

describe('parseTaskView', () => {
  it('reads gates and optional fields defensively', () => {
    const view = parseTaskView({
      id: 't',
      prompt: 'p',
      status: 'todo',
      queuePosition: 2,
      gateValues: [{ commit: 'abc', actor: 'agent', timestamp: 'x' }, 'junk'],
    })
    expect(view).toMatchObject({ id: 't', queuePosition: 2, gates: [{ gateId: 'commit', value: 'abc' }] })
  })

  it('survives garbage', () => {
    expect(parseTaskView(null)).toMatchObject({ id: '', gates: [] })
  })
})

describe('buildEditorUrl', () => {
  it('encodes the path and adds the line', () => {
    expect(buildEditorUrl('/a b/c#d.ts', 4, '')).toBe('vscode://file//a%20b/c%23d.ts:4:1?windowId=_blank')
  })

  it('addresses a remote host through its prefix', () => {
    expect(buildEditorUrl('/x', undefined, 'vscode-remote/ssh-remote+me@host/')).toBe(
      'vscode://vscode-remote/ssh-remote+me@host/x:1:1?windowId=_blank',
    )
  })
})
