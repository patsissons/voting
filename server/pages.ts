// GET /{slug}: the one-segment routes PocketBase's static handler would
// otherwise serve as the SPA shell.
//
// - a dotted name (favicon.svg, og.png, robots.txt, theme-init.js) is a real
//   file in pb_public and falls through to it;
// - <slug>.md, or <slug> with Accept: text/markdown, is the election's
//   markdown page;
// - a published slug gets the shell with <title>, description and the
//   og:* tags rewritten from the row, so pasted links unfurl (crawlers do
//   not run JavaScript), cached briefly;
// - anything else gets the shell with a 404 and no caching, so humans see
//   the app's not-found page and crawlers never unfurl a dead link.
//
// Only GET /{slug} is registered: never GET / (static) or GET /{slug}/ (a
// subtree pattern that would swallow /assets/*). The shell is read per
// request, so a redeploy of pb_public needs no restart.
import type { Election } from '../shared/schema/election.ts'
import { electionOf, pocketbaseDb, snapshotOf } from './db.ts'
import type { Db } from './db.ts'
import { electionMarkdown, llmsText, SLUG_RE } from './markdown.ts'

export const publicDir = () => `${__hooks}/../pb_public`

function escapeHtml(text: string): string {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** The site origin the shell was built for (its og:url), without a trailing slash. */
export function shellOrigin(shell: string): string {
  const m = /property="og:url"\s+content="([^"]+)"/.exec(shell)
  return m ? m[1].replace(/\/+$/, '') : ''
}

const setMeta = (html: string, attr: string, value: string) =>
  html.replace(
    new RegExp(`((?:property|name)="${attr}"\\s+content=")[^"]*`, 'g'),
    `$1${value}`,
  )

/** The shell with its title and social tags rewritten for one election. */
export function rewriteShell(
  shell: string,
  election: Election,
  origin: string,
): string {
  const title = escapeHtml(election.title)
  const description = escapeHtml(election.description)
  let html = shell.replace(
    /<title>[^<]*<\/title>/,
    `<title>${title} · Voting</title>`,
  )
  html = setMeta(html, 'og:title', title)
  html = setMeta(html, 'twitter:title', title)
  html = setMeta(html, 'og:description', description)
  html = setMeta(html, 'twitter:description', description)
  html = setMeta(html, 'description', description)
  html = setMeta(html, 'og:url', `${origin}/${election.slug}`)
  return html
}

function readShell(): string {
  return toString($os.readFile(`${publicDir()}/index.html`))
}

/** The markdown for a slug, or null when it is not a published election. */
export function markdownFor(
  db: Db,
  slug: string,
  origin: string,
): string | null {
  const row = db.publishedElection(slug)
  if (!row) return null
  const election = electionOf(row)
  const latest = db.latestResult(row.id)
  return electionMarkdown(election, latest ? snapshotOf(latest) : null, origin)
}

export function handlePage(e: RequestEvent): void {
  const name = e.request.pathValue('slug') || ''
  const db = pocketbaseDb(e.app)
  const wantsMarkdown = /text\/markdown/.test(
    e.request.header.get('Accept') || '',
  )
  if (name.endsWith('.md') || (wantsMarkdown && SLUG_RE.test(name))) {
    const slug = name.replace(/\.md$/, '')
    const shell = readShell()
    const md = SLUG_RE.test(slug)
      ? markdownFor(db, slug, shellOrigin(shell))
      : null
    if (!md) {
      e.response.header().set('Cache-Control', 'no-store')
      return e.string(404, `No published election "${slug}".\n`)
    }
    e.response.header().set('Cache-Control', 'public, max-age=60')
    return e.blob(200, 'text/markdown; charset=utf-8', md)
  }
  // Asset-like names (anything a slug cannot be) are real files.
  if (!SLUG_RE.test(name)) return e.fileFS($os.dirFS(publicDir()), name)
  const shell = readShell()
  const row = db.publishedElection(name)
  if (!row) {
    e.response.header().set('Cache-Control', 'no-store')
    return e.html(404, shell)
  }
  // Bound CDN staleness explicitly; edge behaviour for hook routes differs from pb_public files.
  e.response.header().set('Cache-Control', 'public, max-age=300')
  return e.html(200, rewriteShell(shell, electionOf(row), shellOrigin(shell)))
}

export function handleLlms(e: RequestEvent): void {
  const db = pocketbaseDb(e.app)
  const origin = shellOrigin(readShell())
  const entries = db.publishedElections().map((row) => {
    const latest = db.latestResult(row.id)
    return {
      election: electionOf(row),
      latest: latest ? snapshotOf(latest).payload : null,
    }
  })
  e.response.header().set('Cache-Control', 'public, max-age=300')
  return e.blob(200, 'text/plain; charset=utf-8', llmsText(entries, origin))
}
