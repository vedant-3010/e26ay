export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'winddesk-theme'

/** The theme `index.html` applied before first paint (stored choice, else OS preference). */
export function currentTheme(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Storage can be unavailable (private mode, blocked site data); the toggle still works.
  }
}
