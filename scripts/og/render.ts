/**
 * Renders the images chat apps and home screens show for voting.lgtm.page:
 * public/og.png (1200x630, the link preview) and public/apple-touch-icon.png
 * (180x180, from public/favicon.svg).
 *
 *   pnpm og
 */
import { chromium } from '@playwright/test'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const WIDTH = 1200
const HEIGHT = 630
const ROOT = path.resolve(import.meta.dirname, '../..')
const FONT = path.join(
  ROOT,
  'node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2',
)

// Palette: the dark tokens from src/index.css plus one accent.
const C = {
  background: 'oklch(0.145 0 0)',
  foreground: 'oklch(0.985 0 0)',
  card: 'oklch(0.205 0 0)',
  mutedForeground: 'oklch(0.708 0 0)',
  border: 'oklch(1 0 0 / 10%)',
  accent: 'oklch(0.72 0.19 150)',
} as const

/** A ballot box with a marked ballot halfway in. */
const BALLOT = `<svg viewBox="0 0 64 64" width="100%" height="100%">
  <rect x="8" y="30" width="48" height="26" rx="5" fill="${C.card}" stroke="${C.border}" stroke-width="2"/>
  <rect x="22" y="31" width="20" height="4" rx="2" fill="${C.background}"/>
  <g transform="rotate(-12 32 18)">
    <rect x="21" y="4" width="22" height="26" rx="2.5" fill="${C.foreground}"/>
    <path d="M26 17l4 4 8-9" fill="none" stroke="${C.accent}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`

async function fontFace(): Promise<string> {
  const font = (await readFile(FONT)).toString('base64')
  return `@font-face { font-family: Geist; src: url(data:font/woff2;base64,${font}) format("woff2"); font-weight: 100 900; }`
}

async function ogHtml(): Promise<string> {
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  ${await fontFace()}
  * { margin: 0; box-sizing: border-box; }
  html, body { width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; }
  body {
    background: ${C.background};
    color: ${C.foreground};
    font-family: Geist, system-ui, sans-serif;
    position: relative;
  }
  .glow {
    position: absolute; inset: 0;
    background:
      radial-gradient(ellipse 620px 420px at 82% 50%, oklch(0.72 0.19 150 / 0.18), transparent 70%),
      radial-gradient(ellipse 700px 500px at 10% 90%, oklch(0.3 0.03 270 / 0.6), transparent 70%);
  }
  .mark { position: absolute; right: 110px; top: 115px; width: 400px; height: 400px; }
  header { position: absolute; left: 80px; top: 160px; width: 640px; }
  .eyebrow { font-size: 26px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: ${C.accent}; }
  h1 { margin-top: 14px; font-size: 118px; font-weight: 800; letter-spacing: -0.045em; line-height: 1; }
  p { margin-top: 24px; font-size: 36px; font-weight: 500; color: ${C.mutedForeground}; line-height: 1.25; }
</style></head>
<body>
  <div class="glow"></div>
  <div class="mark">${BALLOT}</div>
  <header>
    <div class="eyebrow">voting.lgtm.page</div>
    <h1>Voting</h1>
    <p>Vote compasses and<br />live election results.</p>
  </header>
</body></html>`
}

async function iconHtml(size: number): Promise<string> {
  const svg = await readFile(path.join(ROOT, 'public/favicon.svg'), 'utf8')
  return `<!doctype html><html><head><style>
    * { margin: 0; } html, body { width: ${size}px; height: ${size}px; overflow: hidden; }
    svg { display: block; width: ${size}px; height: ${size}px; }
  </style></head><body>${svg}</body></html>`
}

async function render(
  file: string,
  html: string,
  width: number,
  height: number,
): Promise<void> {
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 1,
  })
  await page.setContent(html)
  await page.evaluate(() => document.fonts.ready)
  const png = await page.screenshot({ type: 'png' })
  const out = path.join(ROOT, file)
  await writeFile(out, png)
  console.log(`wrote ${file} (${png.byteLength} bytes)`)
  await page.close()
}

const browser = await chromium.launch()
try {
  await render('public/og.png', await ogHtml(), WIDTH, HEIGHT)
  await render('public/apple-touch-icon.png', await iconHtml(180), 180, 180)
} finally {
  await browser.close()
}
