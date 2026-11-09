/// <reference lib="webworker" />
import { bundledLanguages, createHighlighter, type BundledLanguage, type Highlighter } from 'shiki'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import { fenceLanguage, renderMarkdown } from './render'

const THEME = 'github-dark'
let highlighter: Promise<Highlighter> | null = null

function getHighlighter(): Promise<Highlighter> {
  highlighter ??= createHighlighter({ themes: [THEME], langs: [], engine: createJavaScriptRegexEngine() })
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
    instance?.getLoadedLanguages().includes(lang) ? instance.codeToHtml(code, { lang, theme: THEME }) : null,
  )
  self.postMessage({ id, html })
}
