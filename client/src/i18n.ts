const language = navigator.language.startsWith('fr') ? 'fr' : 'en'

export function t(text: { en: string; fr: string }): string {
  return text[language]
}
