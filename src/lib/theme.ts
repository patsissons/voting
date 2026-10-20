import { useCallback, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

/**
 * The visitor's explicit choice. Without one the page follows the system
 * setting. public/theme-init.js applies the theme before first paint with a
 * copy of this logic; keep the two in sync.
 */
export const THEME_KEY = 'voting:theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'
/** Browser chrome colours: the --background tokens in index.css. */
export const THEME_COLOR: Record<Theme, string> = {
  light: '#ffffff',
  dark: '#0a0a0a',
}

export function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

export function systemTheme(): Theme {
  return window.matchMedia?.(DARK_QUERY).matches ? 'dark' : 'light'
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.style.colorScheme = theme
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', THEME_COLOR[theme])
}

/** The current theme and a toggle that remembers the visitor's choice. */
export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(
    () => storedTheme() ?? systemTheme(),
  )

  useEffect(() => applyTheme(theme), [theme])

  // Track the system setting until the visitor picks a theme.
  useEffect(() => {
    const media = window.matchMedia?.(DARK_QUERY)
    if (!media) return
    const onChange = () => {
      if (!storedTheme()) setTheme(systemTheme())
    }
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark'
      try {
        localStorage.setItem(THEME_KEY, next)
      } catch {
        // Private mode: the choice lasts for this page view only.
      }
      return next
    })
  }, [])

  return [theme, toggle]
}
