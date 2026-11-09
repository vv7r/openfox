import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js'
import 'monaco-editor/esm/vs/editor/editor.all.js'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker.js?worker'

// Each contribution only registers its language; the tokenizer loads on first use
import.meta.glob('/node_modules/monaco-editor/esm/vs/basic-languages/*/*.contribution.js', { eager: true })

self.MonacoEnvironment = { getWorker: () => new EditorWorker() }

const THEME = 'openfox'

function token(name: string): number[] {
  return getComputedStyle(document.documentElement).getPropertyValue(`--color-${name}`).trim().split(/\s+/).map(Number)
}

const toHex = (rgb: number[]) => `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`

/** Rebuilt on each mount so the editor always matches the current app theme. */
function applyTheme(): void {
  const background = token('primary')
  const isDark = (background[0] ?? 0) * 0.299 + (background[1] ?? 0) * 0.587 + (background[2] ?? 0) * 0.114 < 128
  monaco.editor.defineTheme(THEME, {
    base: isDark ? 'vs-dark' : 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': toHex(background),
      'editorGutter.background': toHex(background),
      'editor.foreground': toHex(token('text-primary')),
      'editorLineNumber.foreground': toHex(token('text-muted')),
    },
  })
  monaco.editor.setTheme(THEME)
}

function languageOf(path: string): string {
  const lower = path.toLowerCase()
  const match = monaco.languages
    .getLanguages()
    .find((language) => language.extensions?.some((extension) => lower.endsWith(extension)))
  return match?.id ?? 'plaintext'
}

const OPTIONS = {
  readOnly: true,
  automaticLayout: true,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: 13,
  renderLineHighlight: 'none',
} as const

export function mountFile(element: HTMLElement, path: string, content: string): () => void {
  applyTheme()
  const model = monaco.editor.createModel(content, languageOf(path))
  const editor = monaco.editor.create(element, { ...OPTIONS, model, theme: THEME })
  return () => {
    editor.dispose()
    model.dispose()
  }
}

export function mountDiff(element: HTMLElement, path: string, original: string, modified: string): () => void {
  applyTheme()
  const language = languageOf(path)
  const originalModel = monaco.editor.createModel(original, language)
  const modifiedModel = monaco.editor.createModel(modified, language)
  const editor = monaco.editor.createDiffEditor(element, { ...OPTIONS, renderSideBySide: false, theme: THEME })
  editor.setModel({ original: originalModel, modified: modifiedModel })
  return () => {
    editor.dispose()
    originalModel.dispose()
    modifiedModel.dispose()
  }
}
