import { Marked, type Tokens } from 'marked'

export type Highlight = (code: string, lang: string) => string | null

const SAFE_URL = /^(https?:|mailto:|#|\/|\.\/|\.\.\/)/i

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * Renders model output to HTML that is injected as is: raw HTML is escaped and
 * only allow-listed URL schemes survive, so nothing else can reach the DOM.
 */
export function renderMarkdown(source: string, highlight?: Highlight): string {
  const marked = new Marked({ gfm: true, breaks: false })
  marked.use({
    renderer: {
      html(token: Tokens.HTML | Tokens.Tag) {
        return escapeHtml(token.text)
      },
      link(token: Tokens.Link) {
        const text = this.parser.parseInline(token.tokens)
        if (!SAFE_URL.test(token.href)) return text
        return `<a href="${escapeHtml(token.href)}" target="_blank" rel="noreferrer noopener">${text}</a>`
      },
      image(token: Tokens.Image) {
        if (!/^https?:/i.test(token.href)) return escapeHtml(token.text)
        return `<img src="${escapeHtml(token.href)}" alt="${escapeHtml(token.text)}" loading="lazy" />`
      },
      code(token: Tokens.Code) {
        const lang = token.lang?.split(/\s/)[0] ?? ''
        const highlighted = lang && highlight ? highlight(token.text, lang) : null
        return highlighted ?? `<pre><code>${escapeHtml(token.text)}</code></pre>`
      },
    },
  })
  return marked.parse(source, { async: false })
}

/** The language of a block's opening fence, if it has one. */
export function fenceLanguage(source: string): string | null {
  return /^ {0,3}(?:`{3,}|~{3,})([\w+-]+)/.exec(source)?.[1] ?? null
}
