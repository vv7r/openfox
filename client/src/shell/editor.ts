import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  HighlightStyle,
  indentOnInput,
  LanguageDescription,
  syntaxHighlighting,
} from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import { search, searchKeymap } from '@codemirror/search'
import {
  Compartment,
  EditorState,
  Transaction,
  type Extension,
  type StateEffect,
  type Text,
  type TransactionSpec,
} from '@codemirror/state'
import { drawSelection, dropCursor, EditorView, highlightSpecialChars, keymap, lineNumbers } from '@codemirror/view'
import { tags } from '@lezer/highlight'
import { t } from '../i18n'
import { onTabDisposed } from '../store/workspace'
import { changeBetween, detectEol, normalizeEol, type Eol } from './editorText'

const SYNTAX_COLORS = EditorView.baseTheme({
  '&light': {
    '--syntax-keyword': '#cf222e',
    '--syntax-string': '#0a3069',
    '--syntax-comment': '#6e7781',
    '--syntax-function': '#8250df',
    '--syntax-constant': '#0550ae',
    '--syntax-type': '#953800',
    '--syntax-tag': '#116329',
  },
  '&dark': {
    '--syntax-keyword': '#ff7b72',
    '--syntax-string': '#a5d6ff',
    '--syntax-comment': '#8b949e',
    '--syntax-function': '#d2a8ff',
    '--syntax-constant': '#79c0ff',
    '--syntax-type': '#ffa657',
    '--syntax-tag': '#7ee787',
  },
})

const color = (name: string) => `var(--syntax-${name})`

const HIGHLIGHT = HighlightStyle.define([
  { tag: [tags.keyword, tags.modifier, tags.operatorKeyword], color: color('keyword') },
  { tag: [tags.string, tags.special(tags.string), tags.regexp, tags.link], color: color('string') },
  { tag: tags.comment, color: color('comment'), fontStyle: 'italic' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: color('function') },
  { tag: [tags.number, tags.bool, tags.null, tags.atom, tags.propertyName], color: color('constant') },
  { tag: [tags.typeName, tags.className, tags.namespace, tags.attributeName], color: color('type') },
  { tag: [tags.tagName, tags.heading], color: color('tag'), fontWeight: 'bold' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strong, fontWeight: 'bold' },
  { tag: tags.invalid, color: color('keyword') },
])

// Reads the app's CSS variables, so a theme change needs no rebuild here
const THEME = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '13px',
    color: 'rgb(var(--color-text-primary))',
    backgroundColor: 'rgb(var(--color-primary))',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.5' },
  '.cm-content': { caretColor: 'rgb(var(--color-text-primary))' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'rgb(var(--color-text-primary))' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
    { backgroundColor: 'rgb(var(--color-accent-primary) / 0.3)' },
  '.cm-gutters': {
    border: 'none',
    color: 'rgb(var(--color-text-muted))',
    backgroundColor: 'rgb(var(--color-primary))',
  },
  '.cm-panels': { color: 'inherit', backgroundColor: 'rgb(var(--color-secondary))' },
  '.cm-panels-top': { borderBottom: '1px solid rgb(var(--color-border))' },
  '.cm-textfield, .cm-button': {
    padding: '4px 8px',
    fontSize: '12px',
    color: 'inherit',
    backgroundColor: 'rgb(var(--color-primary))',
    backgroundImage: 'none',
    borderColor: 'rgb(var(--color-border))',
  },
})

/** The strings CodeMirror itself shows in its search panel and fold gutter. */
function phrases(): Record<string, string> {
  return {
    Find: t({ en: 'Find', fr: 'Rechercher' }),
    Replace: t({ en: 'Replace', fr: 'Remplacer' }),
    next: t({ en: 'next', fr: 'suivant' }),
    previous: t({ en: 'previous', fr: 'précédent' }),
    all: t({ en: 'all', fr: 'tout' }),
    'match case': t({ en: 'match case', fr: 'respecter la casse' }),
    regexp: t({ en: 'regexp', fr: 'expression régulière' }),
    'by word': t({ en: 'by word', fr: 'mot entier' }),
    replace: t({ en: 'replace', fr: 'remplacer' }),
    'replace all': t({ en: 'replace all', fr: 'tout remplacer' }),
    close: t({ en: 'close', fr: 'fermer' }),
    'on line': t({ en: 'on line', fr: 'à la ligne' }),
    'current match': t({ en: 'current match', fr: 'occurrence actuelle' }),
    'replaced $ matches': t({ en: 'replaced $ matches', fr: '$ occurrences remplacées' }),
    'replaced match on line $': t({ en: 'replaced match on line $', fr: 'occurrence remplacée à la ligne $' }),
    'Go to line': t({ en: 'Go to line', fr: 'Aller à la ligne' }),
    go: t({ en: 'go', fr: 'aller' }),
    'Fold line': t({ en: 'Fold line', fr: 'Replier la ligne' }),
    'Unfold line': t({ en: 'Unfold line', fr: 'Déplier la ligne' }),
    'Folded lines': t({ en: 'Folded lines', fr: 'Lignes repliées' }),
    'Unfolded lines': t({ en: 'Unfolded lines', fr: 'Lignes dépliées' }),
    'folded code': t({ en: 'folded code', fr: 'code replié' }),
    unfold: t({ en: 'unfold', fr: 'déplier' }),
    to: t({ en: 'to', fr: 'à' }),
    'Selection deleted': t({ en: 'Selection deleted', fr: 'Sélection supprimée' }),
    'Control character': t({ en: 'Control character', fr: 'Caractère de contrôle' }),
  }
}

const readOnlyMode = new Compartment()
const languageMode = new Compartment()
const toneMode = new Compartment()

// Not editable as well as read-only, or tapping a locked file opens the phone keyboard.
// Still focusable, so search and copy keep working.
function readOnlyExtension(readOnly: boolean): Extension {
  return readOnly
    ? [EditorState.readOnly.of(true), EditorView.editable.of(false), EditorView.contentAttributes.of({ tabindex: '0' })]
    : []
}

function isDarkTheme(): boolean {
  const [red = 0, green = 0, blue = 0] = getComputedStyle(document.documentElement)
    .getPropertyValue('--color-primary')
    .trim()
    .split(/\s+/)
    .map(Number)
  return red * 0.299 + green * 0.587 + blue * 0.114 < 128
}

interface FileMount {
  key: string
  path: string
  content: string
  readOnly: boolean
  onDirty: (dirty: boolean) => void
  onSave: () => void
}

interface FileSession {
  state: EditorState
  view: EditorView | null
  scroll: StateEffect<unknown> | null
  /** What is on disk, which undoing back to clears the dirty mark. */
  saved: Text
  eol: Eol
  /** Replacing the text from disk must not read as the user editing it. */
  syncing: boolean
  file: FileMount
}

// Outlives the editor so switching tabs keeps edits, undo history and cursor
const sessions = new Map<string, FileSession>()

onTabDisposed((key) => sessions.delete(key))

function applyTo(session: FileSession, spec: TransactionSpec): void {
  if (session.view) session.view.dispatch(spec)
  else session.state = session.state.update(spec).state
}

const currentState = (session: FileSession) => session.view?.state ?? session.state

function fileExtensions(key: string, readOnly: boolean): Extension {
  return [
    lineNumbers(),
    foldGutter(),
    highlightSpecialChars(),
    history(),
    drawSelection(),
    dropCursor(),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    search({ top: true }),
    EditorState.allowMultipleSelections.of(true),
    EditorState.tabSize.of(2),
    EditorState.phrases.of(phrases()),
    EditorView.lineWrapping,
    syntaxHighlighting(HIGHLIGHT),
    SYNTAX_COLORS,
    THEME,
    readOnlyMode.of(readOnlyExtension(readOnly)),
    languageMode.of([]),
    toneMode.of([]),
    keymap.of([
      {
        key: 'Mod-s',
        preventDefault: true,
        run: () => {
          sessions.get(key)?.file.onSave()
          return true
        },
      },
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...foldKeymap,
      indentWithTab,
    ]),
    EditorView.updateListener.of((update) => {
      const session = sessions.get(key)
      if (update.docChanged && session && !session.syncing) session.file.onDirty(!update.state.doc.eq(session.saved))
    }),
  ]
}

function loadLanguage(session: FileSession, path: string): void {
  const description = LanguageDescription.matchFilename(languages, path.split('/').pop() ?? path)
  description
    ?.load()
    .then((support) => {
      if (sessions.get(session.file.key) === session) applyTo(session, { effects: languageMode.reconfigure(support) })
    })
    // Without its grammar the file stays readable and editable as plain text
    .catch(() => undefined)
}

function createSession(file: FileMount): FileSession {
  const state = EditorState.create({ doc: file.content, extensions: fileExtensions(file.key, file.readOnly) })
  const session: FileSession = {
    state,
    view: null,
    scroll: null,
    saved: state.doc,
    eol: detectEol(file.content),
    syncing: false,
    file,
  }
  sessions.set(file.key, session)
  loadLanguage(session, file.path)
  return session
}

export function mountFile(element: HTMLElement, file: FileMount): () => void {
  const session = sessions.get(file.key) ?? createSession(file)
  session.file = file
  applyTo(session, { effects: toneMode.reconfigure(EditorView.darkTheme.of(isDarkTheme())) })
  const view = new EditorView({
    state: session.state,
    parent: element,
    ...(session.scroll ? { scrollTo: session.scroll } : {}),
  })
  session.view = view
  return () => {
    session.state = view.state
    session.scroll = view.scrollSnapshot()
    session.view = null
    view.destroy()
  }
}

export function setReadOnly(key: string, readOnly: boolean): void {
  const session = sessions.get(key)
  if (session) applyTo(session, { effects: readOnlyMode.reconfigure(readOnlyExtension(readOnly)) })
}

export function fileSnapshot(key: string): { text: string; version: Text } | null {
  const session = sessions.get(key)
  if (!session) return null
  const { doc } = currentState(session)
  return { text: doc.sliceString(0, doc.length, session.eol), version: doc }
}

/** Marks `version` as what is on disk; true while the editor has moved on from it. */
export function markSaved(key: string, version: Text): boolean {
  const session = sessions.get(key)
  if (!session) return false
  session.saved = version
  return !currentState(session).doc.eq(version)
}

/** Brings a clean editor to the text on disk, leaving the cursor and scroll where they are. */
export function syncFile(key: string, content: string): void {
  const session = sessions.get(key)
  if (!session) return
  session.eol = detectEol(content)
  const changes = changeBetween(currentState(session).doc.toString(), normalizeEol(content))
  if (changes) {
    session.syncing = true
    applyTo(session, { changes, annotations: Transaction.addToHistory.of(false) })
    session.syncing = false
  }
  session.saved = currentState(session).doc
}
