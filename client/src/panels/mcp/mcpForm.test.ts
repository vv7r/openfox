import { describe, expect, it } from 'vitest'
import { emptyMcpForm, mcpBody, mcpFormFrom, parseKeyValues, validateMcpForm } from './mcpForm'

describe('parseKeyValues', () => {
  it('keeps values containing an equals sign and skips junk', () => {
    expect(parseKeyValues('A=1\n\nB=x=y\nnope\n=z')).toEqual({ A: '1', B: 'x=y' })
  })
})

describe('validateMcpForm', () => {
  const stdio = { ...emptyMcpForm(), name: 'fs', command: 'npx' }

  it('accepts a complete form', () => {
    expect(validateMcpForm(stdio, true)).toBeNull()
  })

  it('requires a name only when adding', () => {
    expect(validateMcpForm({ ...stdio, name: '' }, true)).not.toBeNull()
    expect(validateMcpForm({ ...stdio, name: '' }, false)).toBeNull()
  })

  it('requires the field of the transport', () => {
    expect(validateMcpForm({ ...stdio, command: '' }, true)).not.toBeNull()
    expect(validateMcpForm({ ...stdio, transport: 'http' }, true)).not.toBeNull()
  })

  it('rejects a bad timeout', () => {
    expect(validateMcpForm({ ...stdio, timeout: '0' }, true)).not.toBeNull()
    expect(validateMcpForm({ ...stdio, timeout: 'abc' }, true)).not.toBeNull()
  })
})

describe('mcpBody', () => {
  it('sends only the fields of stdio', () => {
    const body = mcpBody(
      { ...emptyMcpForm(), name: 'fs', command: 'npx', args: 'a  b', env: 'K=V', timeout: '30' },
      true,
    )
    expect(body).toEqual({
      name: 'fs',
      transport: 'stdio',
      command: 'npx',
      args: ['a', 'b'],
      env: { K: 'V' },
      timeout: 30,
    })
  })

  it('sends only the fields of http and no name on edit', () => {
    const form = {
      ...emptyMcpForm(),
      name: 'x',
      transport: 'http' as const,
      url: 'http://a',
      headers: 'H=1',
      oauth: true,
    }
    expect(mcpBody(form, false)).toEqual({ transport: 'http', url: 'http://a', headers: { H: '1' }, oauth: true })
  })
})

describe('mcpFormFrom', () => {
  it('turns a config back into editable text', () => {
    const form = mcpFormFrom({
      name: 'fs',
      config: { transport: 'stdio', command: 'npx', args: ['a', 'b'], env: { K: 'V', L: 'W' }, timeout: 5 },
    })
    expect(form).toMatchObject({ args: 'a b', env: 'K=V\nL=W', timeout: '5', transport: 'stdio' })
  })
})
