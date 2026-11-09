/// <reference lib="webworker" />
import { bundledLanguages, createHighlighter, type BundledLanguage, type Highlighter } from 'shiki'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import { fenceLanguage, renderMarkdown } from './render'

const THEMES = { dark: 'github-dark', light: 'github-light' }
/** GitHub's comment grey and orange are too faint on the tinted code blocks of some themes. */
const READABLE_COLORS = { 'github-dark': { '#6a737d': '#9aa4b0' }, 'github-light': { '#e36209': '#b34a00' } }
let highlighter: Promise<Highlighter> | null = null

function getHighlighter(): Promise<Highlighter> {
  highlighter ??= createHighlighter({ themes: Object.values(THEMES), langs: [], engine: createJavaScriptRegexEngine() })
  return highlighter
}

async function highlighterFor(source: string): Promise<Highlighter | null> {
  const lang = fenceLanguage(source)
  if (!lang || !(lang in bundledLanguages)) return null
  const instance = await getHighlighter()
  if (!instance.getLoadedLanguages().includes(lang)) await instance.loadLanguage(lang as BundledLanguage)
  return instance
}

self.onmessage = async (event: MessageEvent<{ id: number; source: string }>) => {
  const { id, source } = event.data
  let instance: Highlighter | null = null
  try {
    instance = await highlighterFor(source)
  } catch {
    // Unhighlighted code is still correct code
  }
  const html = renderMarkdown(source, (code, lang) =>
    instance?.getLoadedLanguages().includes(lang)
      ? instance.codeToHtml(code, { lang, themes: THEMES, defaultColor: false, colorReplacements: READABLE_COLORS })
      : null,
  )
  self.postMessage({ id, html })
}
