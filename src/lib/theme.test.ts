import { beforeEach, describe, expect, it } from 'vitest'
import { THEME_COLOR, THEME_KEY, applyTheme, storedTheme } from './theme'

describe('theme', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark')
    document.head.innerHTML = '<meta name="theme-color" content="" />'
  })

  it('reads only valid stored values', () => {
    expect(storedTheme()).toBeNull()
    localStorage.setItem(THEME_KEY, 'dark')
    expect(storedTheme()).toBe('dark')
    localStorage.setItem(THEME_KEY, 'sepia')
    expect(storedTheme()).toBeNull()
  })

  it('applies the class, color-scheme and theme-color together', () => {
    applyTheme('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.style.colorScheme).toBe('dark')
    expect(
      document
        .querySelector('meta[name="theme-color"]')
        ?.getAttribute('content'),
    ).toBe(THEME_COLOR.dark)

    applyTheme('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(
      document
        .querySelector('meta[name="theme-color"]')
        ?.getAttribute('content'),
    ).toBe(THEME_COLOR.light)
  })
})
