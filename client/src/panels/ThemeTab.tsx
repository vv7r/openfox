import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Pencil, X } from 'lucide-react'
import { getJson } from '../api'
import { saveSetting } from '../controller'
import { useLoad } from '../hooks'
import { t } from '../i18n'
import presets from '../theme/presets.json'
import { DEFAULT_DARK_THEME, DEFAULT_LIGHT_THEME } from '../theme/resolve'
import {
  SYSTEM_PREFS_KEY,
  USER_PRESETS_KEY,
  applyTheme,
  applyThemeLibrary,
  type SystemPrefs,
  type UserThemePreset,
} from '../theme/theme'
import styles from './Panels.module.css'
import tabStyles from './Theme.module.css'
import { hexToTriplet, tripletToHex } from './themeColors'

type Mode = 'dark' | 'light'
type Tokens = Record<string, string>

interface Preset {
  id: string
  name: string
  mode?: Mode
  tokens: Tokens
}

const builtIn = presets.presets as Preset[]
const THEME_TOKENS = presets.tokens as Array<{ key: string; category: string; label: string; defaultValue: string }>

const CATEGORY_LABELS: Record<string, { en: string; fr: string }> = {
  background: { en: 'Backgrounds', fr: 'Arrière-plans' },
  surface: { en: 'Surfaces', fr: 'Surfaces' },
  text: { en: 'Text', fr: 'Texte' },
  accent: { en: 'Accents', fr: 'Accents' },
  border: { en: 'Border', fr: 'Bordures' },
}

const SETTINGS = ['display.theme', USER_PRESETS_KEY, SYSTEM_PREFS_KEY].join(',')

function parse<T>(raw: string | undefined, fallback: T): T {
  try {
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function tokensOf(preset: UserThemePreset): Tokens {
  return { ...builtIn.find((item) => item.id === preset.basePreset)?.tokens, ...preset.tokens }
}

function modeOf(preset: UserThemePreset): Mode | undefined {
  return preset.mode ?? builtIn.find((item) => item.id === preset.basePreset)?.mode
}

interface EditorState {
  isNew: boolean
  id: string | null
  basePreset: string
  name: string
  mode: Mode
  tokens: Tokens
}

function ThemeDialog({
  state,
  onClose,
  onSave,
}: {
  state: EditorState
  onClose: () => void
  onSave: (name: string, mode: Mode, tokens: Tokens) => void
}) {
  const [name, setName] = useState(state.name)
  const [mode, setMode] = useState(state.mode)
  const [tokens, setTokens] = useState(state.tokens)
  const categories = [...new Set(THEME_TOKENS.map((token) => token.category))]
  const setToken = (key: string, value: string) => setTokens((current) => ({ ...current, [key]: hexToTriplet(value) }))

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.dialog} data-testid="theme-editor" aria-describedby={undefined}>
          <div className={styles.header}>
            <Dialog.Title className={styles.title}>
              {state.isNew
                ? t({ en: 'New theme', fr: 'Nouveau thème' })
                : t({ en: 'Edit theme', fr: 'Modifier le thème' })}
            </Dialog.Title>
            <Dialog.Close className={styles.close} aria-label={t({ en: 'Close', fr: 'Fermer' })}>
              <X size={16} />
            </Dialog.Close>
          </div>
          <div className={styles.body}>
            <div className={styles.stack}>
              <div className={styles.row}>
                <label className={`${styles.field} ${styles.grow}`}>
                  {t({ en: 'Name', fr: 'Nom' })}
                  <input
                    className={styles.input}
                    data-testid="theme-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </label>
                <div className={styles.field}>
                  <span>{t({ en: 'Mode', fr: 'Mode' })}</span>
                  <div className={tabStyles.segmented}>
                    <button type="button" aria-pressed={mode === 'dark'} onClick={() => setMode('dark')}>
                      {t({ en: 'Dark', fr: 'Sombre' })}
                    </button>
                    <button type="button" aria-pressed={mode === 'light'} onClick={() => setMode('light')}>
                      {t({ en: 'Light', fr: 'Clair' })}
                    </button>
                  </div>
                </div>
              </div>
              {!state.isNew && (
                <p className={styles.muted}>
                  {`${t({ en: 'Based on', fr: 'Basé sur' })} ${builtIn.find((item) => item.id === state.basePreset)?.name ?? state.basePreset}`}
                </p>
              )}
              {categories.map((category) => (
                <section key={category}>
                  <h4 className={styles.eyebrow}>{t(CATEGORY_LABELS[category] ?? { en: category, fr: category })}</h4>
                  <div className={tabStyles.tokens}>
                    {THEME_TOKENS.filter((token) => token.category === category).map((token) => {
                      const value = tokens[token.key] ?? token.defaultValue
                      return (
                        <div key={token.key} className={styles.field}>
                          <span>{token.label}</span>
                          <div className={styles.row}>
                            <input
                              type="color"
                              aria-label={token.label}
                              data-testid={`token-${token.key}`}
                              className={tabStyles.swatchInput}
                              value={tripletToHex(value)}
                              onChange={(event) => setToken(token.key, event.target.value)}
                            />
                            <input
                              className={`${styles.input} ${tabStyles.tokenText}`}
                              aria-label={token.label}
                              value={value}
                              onChange={(event) => setToken(token.key, event.target.value)}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </section>
              ))}
              <div className={styles.row}>
                <span className={styles.grow} />
                <button type="button" onClick={onClose}>
                  {t({ en: 'Cancel', fr: 'Annuler' })}
                </button>
                <button
                  type="button"
                  className={styles.primary}
                  data-testid="theme-save"
                  onClick={() => onSave(name.trim() || t({ en: 'Untitled', fr: 'Sans titre' }), mode, tokens)}
                >
                  {t({ en: 'Save', fr: 'Enregistrer' })}
                </button>
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function Swatch({
  name,
  tokens,
  active,
  underlying,
  onClick,
  testId,
}: {
  name: string
  tokens: Tokens
  active: boolean
  underlying: boolean
  onClick: () => void
  testId: string
}) {
  const color = (key: string) => (tokens[key] ? `rgb(${tokens[key]})` : undefined)
  return (
    <button
      type="button"
      className={tabStyles.swatch}
      data-active={active || undefined}
      data-underlying={underlying || undefined}
      data-testid={testId}
      onClick={onClick}
    >
      <span
        className={tabStyles.preview}
        style={{ backgroundColor: color('color-bg-primary'), borderColor: color('color-border') }}
      >
        <span style={{ backgroundColor: color('color-text-primary') }} />
      </span>
      {name}
    </button>
  )
}

const DEFAULT_PREFS: SystemPrefs = { darkPreset: DEFAULT_DARK_THEME, lightPreset: DEFAULT_LIGHT_THEME }

export function ThemeTab() {
  const { data } = useLoad(() => getJson<Record<string, string>>(`/api/settings?keys=${SETTINGS}`), 'theme-settings')
  if (!data) return null
  return <ThemeGallery settings={data} />
}

function ThemeGallery({ settings }: { settings: Record<string, string> }) {
  const [saved, setSaved] = useState(settings['display.theme'] ?? '')
  const [users, setUsers] = useState(parse<UserThemePreset[]>(settings[USER_PRESETS_KEY], []))
  const [prefs, setPrefs] = useState(parse<SystemPrefs>(settings[SYSTEM_PREFS_KEY], DEFAULT_PREFS))
  const [editor, setEditor] = useState<EditorState | null>(null)

  const current = parse<{ preset?: string; tokens?: Tokens }>(
    saved[0] === '{' ? saved : '',
    saved ? { preset: saved } : {},
  )
  const system = current.preset === 'system'
  const activeUser = users.find((preset) => JSON.stringify(preset.tokens) === JSON.stringify(current.tokens))

  const persist = (json: string, library: { users?: UserThemePreset[]; prefs?: SystemPrefs } = {}) => {
    const nextUsers = library.users ?? users
    const nextPrefs = library.prefs ?? prefs
    applyThemeLibrary(JSON.stringify(nextUsers), JSON.stringify(nextPrefs))
    setSaved(json)
    applyTheme(json)
    void saveSetting('display.theme', json)
  }

  const saveUsers = (next: UserThemePreset[]) => {
    setUsers(next)
    void saveSetting(USER_PRESETS_KEY, JSON.stringify(next))
  }

  const savePrefs = (next: SystemPrefs) => {
    setPrefs(next)
    void saveSetting(SYSTEM_PREFS_KEY, JSON.stringify(next))
    persist(JSON.stringify({ preset: 'system' }), { prefs: next })
  }

  const pickBuiltIn = (preset: Preset) => {
    if (!system) {
      persist(JSON.stringify({ preset: preset.id }))
      return
    }
    savePrefs(preset.mode === 'light' ? { ...prefs, lightPreset: preset.id } : { ...prefs, darkPreset: preset.id })
  }

  const pickUser = (preset: UserThemePreset, library?: UserThemePreset[]) => {
    if (!system) {
      persist(
        JSON.stringify({ preset: preset.basePreset, tokens: preset.tokens }),
        library ? { users: library } : undefined,
      )
      return
    }
    savePrefs(modeOf(preset) === 'light' ? { ...prefs, lightPreset: preset.id } : { ...prefs, darkPreset: preset.id })
  }

  const saveEdited = (name: string, mode: Mode, tokens: Tokens) => {
    if (!editor) return
    const preset: UserThemePreset = editor.id
      ? { ...users.find((item) => item.id === editor.id)!, name, mode, tokens }
      : { id: `custom-${Date.now()}`, name, basePreset: editor.basePreset, mode, tokens }
    const next = editor.id ? users.map((item) => (item.id === editor.id ? preset : item)) : [...users, preset]
    saveUsers(next)
    pickUser(preset, next)
    setEditor(null)
  }

  const remove = (preset: UserThemePreset) => saveUsers(users.filter((item) => item.id !== preset.id))

  const toggleSystem = () => {
    const concrete = builtIn.find((item) => item.id === prefs.darkPreset)?.id ?? DEFAULT_DARK_THEME
    persist(JSON.stringify({ preset: system ? concrete : 'system' }))
  }

  const isUnderlying = (id: string) => system && (id === prefs.darkPreset || id === prefs.lightPreset)

  return (
    <div className={styles.stack} data-testid="theme-tab">
      <label className={styles.toggle}>
        <input type="checkbox" data-testid="theme-system" checked={system} onChange={toggleSystem} />
        {t({ en: 'Follow system theme', fr: 'Suivre le thème système' })}
      </label>
      {(['dark', 'light'] as const).map((mode) => (
        <section key={mode}>
          <h3 className={styles.eyebrow}>
            {mode === 'dark'
              ? t({ en: 'Dark themes', fr: 'Thèmes sombres' })
              : t({ en: 'Light themes', fr: 'Thèmes clairs' })}
          </h3>
          <div className={tabStyles.gallery}>
            {builtIn
              .filter((preset) => preset.mode === mode)
              .map((preset) => (
                <div key={preset.id} className={tabStyles.cell}>
                  <Swatch
                    name={preset.name}
                    tokens={preset.tokens}
                    active={!system && !current.tokens && current.preset === preset.id}
                    underlying={isUnderlying(preset.id)}
                    testId={`theme-${preset.id}`}
                    onClick={() => pickBuiltIn(preset)}
                  />
                  <button
                    type="button"
                    className={tabStyles.corner}
                    data-testid={`theme-copy-${preset.id}`}
                    aria-label={t({
                      en: 'Create a custom theme from this one',
                      fr: 'Créer un thème personnalisé à partir de celui-ci',
                    })}
                    onClick={() =>
                      setEditor({
                        isNew: true,
                        id: null,
                        basePreset: preset.id,
                        name: `${preset.name} ${t({ en: 'Copy', fr: 'Copie' })}`,
                        mode,
                        tokens: { ...preset.tokens },
                      })
                    }
                  >
                    <Pencil size={11} />
                  </button>
                </div>
              ))}
            {users
              .filter((preset) => modeOf(preset) === mode)
              .map((preset) => (
                <div key={preset.id} className={tabStyles.cell}>
                  <Swatch
                    name={preset.name}
                    tokens={tokensOf(preset)}
                    active={!system && activeUser?.id === preset.id}
                    underlying={isUnderlying(preset.id)}
                    testId={`theme-${preset.id}`}
                    onClick={() => pickUser(preset)}
                  />
                  <button
                    type="button"
                    className={tabStyles.corner}
                    aria-label={t({ en: 'Edit', fr: 'Modifier' })}
                    onClick={() =>
                      setEditor({
                        isNew: false,
                        id: preset.id,
                        basePreset: preset.basePreset,
                        name: preset.name,
                        mode,
                        tokens: tokensOf(preset),
                      })
                    }
                  >
                    <Pencil size={11} />
                  </button>
                  <button
                    type="button"
                    className={tabStyles.remove}
                    data-testid={`theme-delete-${preset.id}`}
                    aria-label={t({ en: 'Delete', fr: 'Supprimer' })}
                    onClick={() => remove(preset)}
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
          </div>
        </section>
      ))}
      {editor && <ThemeDialog state={editor} onClose={() => setEditor(null)} onSave={saveEdited} />}
    </div>
  )
}
