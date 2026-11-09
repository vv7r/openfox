import { locales, setLocale, t, type Locale } from '@shared/i18n/index.js'

const STORAGE_KEY = 'openfox:locale'

export { t }

/** 'en' | 'fr' as is; 'automatic' or anything unknown follows the browser. */
export function resolveLocale(setting: string | null | undefined, browser: string): Locale {
  if (setting === 'en' || setting === 'fr') return setting
  const primary = browser.split('-')[0]?.toLowerCase() ?? ''
  return (locales as readonly string[]).includes(primary) ? (primary as Locale) : 'en'
}

function read(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

/** Applies the last known locale so the first paint is already translated. */
export function applyCachedLocale(): Locale {
  const locale = resolveLocale(read(), navigator.language)
  setLocale(locale)
  return locale
}

export function applyLocale(setting: string | undefined): Locale {
  const locale = resolveLocale(setting, navigator.language)
  setLocale(locale)
  try {
    localStorage.setItem(STORAGE_KEY, locale)
  } catch {
    // Only costs a retranslation on the next load
  }
  return locale
}
