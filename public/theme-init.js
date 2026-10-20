// Applies the theme before first paint so there is no flash. Mirrors
// src/lib/theme.ts (key, media query, theme-color values), which takes over
// once the app loads: change both together.
;(function () {
  var theme
  try {
    theme = localStorage.getItem('voting:theme')
  } catch (e) {}
  if (theme !== 'light' && theme !== 'dark') {
    theme = matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light'
  }
  var root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.style.colorScheme = theme
  var meta = document.querySelector('meta[name="theme-color"]')
  if (meta)
    meta.setAttribute('content', theme === 'dark' ? '#0a0a0a' : '#ffffff')
})()
