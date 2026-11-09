// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { fenceLanguage, renderMarkdown } from './render'

describe('renderMarkdown', () => {
  it('renders GFM tables', () => {
    expect(renderMarkdown('| a |\n| - |\n| b |')).toContain('<table>')
  })

  it('escapes raw HTML from the model', () => {
    const html = renderMarkdown('<img src=x onerror=alert(1)>\n\n<script>alert(1)</script>')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<script')
    expect(html).toContain('&lt;script&gt;')
  })

  it('escapes inline HTML', () => {
    expect(renderMarkdown('a <b onclick=x>b</b>')).not.toContain('<b ')
  })

  it.each(['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,x', 'java&#115;cript:alert(1)'])(
    'drops the link for %s',
    (href) => {
      const html = renderMarkdown(`[go](${href})`)
      expect(html).not.toContain('<a ')
      expect(html).toContain('go')
    },
  )

  it('keeps http links and isolates them', () => {
    const html = renderMarkdown('[go](https://example.com)')
    expect(html).toContain('href="https://example.com"')
    expect(html).toContain('rel="noreferrer noopener"')
  })

  it('only loads images over http', () => {
    expect(renderMarkdown('![x](javascript:alert(1))')).not.toContain('<img')
    expect(renderMarkdown('![x](https://e.com/a.png)')).toContain('<img')
  })

  it('escapes code when no highlighter applies', () => {
    expect(renderMarkdown('```\n<b>\n```')).toContain('&lt;b&gt;')
  })

  it('uses the highlighter output when it has one', () => {
    expect(renderMarkdown('```ts\na\n```', () => '<pre>hl</pre>')).toBe('<pre>hl</pre>')
  })
})

describe('fenceLanguage', () => {
  it('reads the language of the opening fence', () => {
    expect(fenceLanguage('```ts\na\n```')).toBe('ts')
    expect(fenceLanguage('```\na\n```')).toBeNull()
    expect(fenceLanguage('text')).toBeNull()
  })
})
