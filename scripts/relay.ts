// Election-night relay: polls an election's results source and pushes each
// new snapshot to the ingest route (POST /_voting/ingest/<slug>), which
// normalizes and stores it. Five sources, chosen by results.format in
// elections/<slug>.json:
//   vancouver  results.vancouver.ca/data/arearesults.json, fetched through
//              headless Chrome over the DevTools protocol: the City answers
//              403 to every non-browser client (curl, Node fetch, $http.send)
//              and to the default "HeadlessChrome" agent too.
//   ebc-enr    Elections BC's election-night page (an HTML file on
//              electionsbcenr.blob.core.windows.net, refreshed every 3
//              minutes), plain fetch. The URL is only known once Elections BC
//              posts it after polls close, so --source is required.
//   eab-ref    Elections Alberta's per-question pages, fetched together and
//              posted as one JSON document { fetchedAt, pages }.
//   eab-dash   the JSON behind Elections Alberta's results dashboard, posted
//              as is; a retired feed version is followed to the current one.
//   civicapi   civicAPI's race documents, one per chamber (results.races),
//              fetched together and posted as { fetchedAt, races }.
//
//   VOTING_INGEST_TOKEN=... pnpm relay --election bc-2026 --source <url>
//     [--target https://voting.lgtm.page] [--match <regex>] [--interval 60]
//     [--once] [--official] [--chrome <path>]
//   pnpm relay --election bc-2026 --source <url> --dump <file>   save one page, post nothing
//   VOTING_INGEST_TOKEN=... pnpm relay --fixture --election bc-2026 --target http://127.0.0.1:8090
//     posts the synthetic night (scripts/fixtures/fixture.ts) a few seconds apart
//
// Election night: hand the results page to the server-side fetch too, which
// then pulls it on its own every minute:
//   curl -X POST -H "Authorization: Bearer $VOTING_INGEST_TOKEN" \
//     "https://voting.lgtm.page/_voting/source/bc-2026?url=<page>"
// and run this relay alongside as the backup (both are safe together). After
// the final count, once more with --official --once.
import { execFileSync, spawn } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { dashSource, normalize } from '../shared/parsers/index.ts'
import type { Election } from '../shared/schema/election.ts'
import { feedText, fixtureFeeds } from './fixtures/fixture.ts'
import { argv, loadElection } from './lib/elections.ts'

const args = argv()
const slug = args.flag('election') || 'vancouver-2026'
const election = loadElection(slug)
const format = election.results.format
let source = args.flag('source') || election.results.source || ''
const matchKey = format === 'ebc-enr' ? 'eventMatch' : 'projectMatch'
const matchSource =
  args.flag('match') ||
  (election.results as unknown as Record<string, string | undefined>)[
    matchKey
  ] ||
  '.'
const target = (args.flag('target') || 'https://voting.lgtm.page').replace(
  /\/$/,
  '',
)
const intervalMs =
  Number(args.flag('interval') || (args.has('fixture') ? 4 : 60)) * 1000
const token = process.env.VOTING_INGEST_TOKEN || ''
const dumpPath = args.flag('dump')
// The relay checks the page the same way the ingest hook will, with --match applied.
const config = {
  ...election,
  results: { ...election.results, [matchKey]: matchSource },
} as Election
const lenient = {
  ...election,
  results: { ...election.results, projectMatch: '.', eventMatch: '.' },
} as unknown as Election

const log = (...parts: unknown[]) =>
  console.log(new Date().toISOString().slice(11, 19), ...parts)
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

if (!dumpPath && !token) {
  console.error(
    'VOTING_INGEST_TOKEN is not set (the same value as the instance secret)',
  )
  process.exit(1)
}

async function post(text: string) {
  const url = `${target}/_voting/ingest/${slug}${args.has('official') ? '?official=1' : ''}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': format === 'ebc-enr' ? 'text/html' : 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: text,
  })
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
  return { status: res.status, body }
}

/** What a snapshot is, for the log: parsed exactly as the hook will parse it. */
function describe(text: string) {
  try {
    const r = normalize(text, lenient)
    return {
      ok: true,
      stamp: r.sig || r.asOf,
      tag: `${r.project || slug} @ ${r.asOf}: ${r.polls.closed}/${r.polls.total} ${election.results.unit || 'polls'}, ${r.ballots} ballots`,
    }
  } catch (err) {
    const e = err as { code?: string; message?: string }
    return { ok: false, stamp: '', tag: `unreadable (${e.code || e.message})` }
  }
}

function matches(text: string) {
  try {
    normalize(text, config)
    return true
  } catch (err) {
    return (err as { code?: string }).code !== 'project_mismatch'
  }
}

// ---- fixture mode -----------------------------------------------------------

if (args.has('fixture')) {
  const feeds = fixtureFeeds(election)
  for (const [i, feed] of feeds.entries()) {
    const text = feedText(feed)
    const { status, body } = await post(text)
    log(
      `fixture ${i + 1}/${feeds.length} ${describe(text).stamp}: ${status} ${JSON.stringify(body)}`,
    )
    if (args.has('once')) break
    if (i < feeds.length - 1) await sleep(intervalMs)
  }
  process.exit(0)
}

if (!source) {
  console.error(
    `no source for ${slug}: pass --source <url> (results.source is empty in elections/${slug}.json)`,
  )
  process.exit(1)
}

// ---- fetchers ---------------------------------------------------------------

let stopping = false
let shutdown = (code = 0): void => process.exit(code)
let fetchFeed: () => Promise<{ status: number; text: string }>
let reopen = async () => {}

const bust = (url: string) =>
  `${url}${url.includes('?') ? '&' : '?'}_=${Date.now()}`

if (format === 'eab-ref') {
  const pages =
    election.results.format === 'eab-ref' ? election.results.pages || [] : []
  const template =
    election.results.format === 'eab-ref' ? election.results.page || '' : ''
  fetchFeed = async () => {
    const doc: { fetchedAt: string; pages: { n: number; html: string }[] } = {
      fetchedAt: new Date().toISOString(),
      pages: [],
    }
    for (const page of pages) {
      const url = source + template.replace('{event}', page.event)
      try {
        const res = await fetch(bust(url), {
          cache: 'no-store',
          headers: { accept: 'text/html,*/*' },
        })
        if (res.ok) doc.pages.push({ n: page.n, html: await res.text() })
        else log(`Q${page.n} answered ${res.status}`)
      } catch (err) {
        log(`Q${page.n} failed: ${(err as Error).message || err}`)
      }
    }
    return doc.pages.length
      ? { status: 200, text: JSON.stringify(doc) }
      : { status: 0, text: 'every page failed' }
  }
} else if (format === 'civicapi') {
  const races =
    election.results.format === 'civicapi' ? election.results.races : {}
  fetchFeed = async () => {
    const doc: { fetchedAt: string; races: Record<string, unknown> } = {
      fetchedAt: new Date().toISOString(),
      races: {},
    }
    for (const [key, id] of Object.entries(races)) {
      try {
        const res = await fetch(bust(`${source}${id}`), {
          cache: 'no-store',
          headers: { accept: 'application/json,*/*' },
        })
        if (!res.ok) return { status: res.status, text: `${key} ${res.status}` }
        doc.races[key] = await res.json()
      } catch (err) {
        return { status: 0, text: `${key} ${(err as Error).message || err}` }
      }
    }
    return { status: 200, text: JSON.stringify(doc) }
  }
} else if (format === 'ebc-enr' || format === 'eab-dash') {
  const get = async (url: string) => {
    const res = await fetch(bust(url), {
      cache: 'no-store',
      headers: {
        accept:
          format === 'eab-dash' ? 'application/json,*/*' : 'text/html,*/*',
      },
    })
    return { status: res.status, text: await res.text() }
  }
  fetchFeed = async () => {
    try {
      const got = await get(source)
      // A new dashboard version retires the feed URL; follow the page to it.
      if (
        format === 'eab-dash' &&
        got.status === 200 &&
        /"forceFullRefresh"\s*:\s*true/.test(got.text) &&
        !/"referendumResults"/.test(got.text)
      ) {
        const page = await get(election.results.official)
        const next = page.status === 200 ? dashSource(source, page.text) : ''
        if (next) {
          log(`feed version moved: ${next}`)
          source = next
          return await get(source)
        }
      }
      return got
    } catch (err) {
      return { status: 0, text: String((err as Error).message || err) }
    }
  }
} else {
  const chromePath =
    args.flag('chrome') ||
    process.env.CHROME ||
    [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/usr/bin/google-chrome',
      '/usr/bin/chromium',
    ].find((p) => existsSync(p))
  if (!chromePath) {
    console.error('no Chrome found: pass --chrome <path> or set CHROME')
    process.exit(1)
  }

  // An ordinary desktop user agent at the installed major version.
  const major =
    /(\d+)\./.exec(execFileSync(chromePath, ['--version']).toString())?.[1] ||
    '141'
  const userAgent = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`

  const profile = mkdtempSync(path.join(tmpdir(), 'voting-relay-'))
  const chrome = spawn(
    chromePath,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      `--user-agent=${userAgent}`,
      'about:blank',
    ],
    {
      stdio: 'ignore',
    },
  )

  shutdown = (code = 0) => {
    if (stopping) return
    stopping = true
    try {
      chrome.kill()
    } catch {
      // already gone
    }
    setTimeout(() => {
      rmSync(profile, { recursive: true, force: true })
      process.exit(code)
    }, 300)
  }
  chrome.on('exit', () => {
    if (!stopping) {
      log('chrome exited')
      shutdown(1)
    }
  })

  // Chrome writes the chosen port to DevToolsActivePort in the profile.
  async function devtoolsPort() {
    for (let i = 0; i < 100; i++) {
      try {
        return Number(
          readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split(
            '\n',
          )[0],
        )
      } catch {
        await sleep(100)
      }
    }
    throw new Error('Chrome did not open a DevTools port')
  }

  async function connect() {
    const port = await devtoolsPort()
    const targets = (await (
      await fetch(`http://127.0.0.1:${port}/json/list`)
    ).json()) as { type: string; webSocketDebuggerUrl: string }[]
    const page = targets.find((t) => t.type === 'page')!
    const ws = new WebSocket(page.webSocketDebuggerUrl)
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve()
      ws.onerror = reject
    })
    let id = 0
    const pending = new Map<
      number,
      (msg: { error?: { message: string }; result?: unknown }) => void
    >()
    ws.onmessage = (event) => {
      const msg = JSON.parse(String(event.data))
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)!(msg)
        pending.delete(msg.id)
      }
    }
    return (method: string, params: Record<string, unknown> = {}) =>
      new Promise<Record<string, unknown>>((resolve, reject) => {
        const n = ++id
        pending.set(n, (msg) =>
          msg.error
            ? reject(new Error(`${method}: ${msg.error.message}`))
            : resolve(msg.result as Record<string, unknown>),
        )
        ws.send(JSON.stringify({ id: n, method, params }))
      })
  }

  const send = await connect()

  // Same-origin fetches from a page on the feed's own origin.
  reopen = async () => {
    await send('Page.enable')
    await send('Page.navigate', { url: source })
    await sleep(3000)
  }

  fetchFeed = async () => {
    const expression = `fetch(${JSON.stringify(bust(source))}, { cache: 'no-store' })
      .then(async (r) => ({ status: r.status, text: await r.text() }))
      .catch((e) => ({ status: 0, text: String(e) }))`
    const { result, exceptionDetails } = (await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })) as {
      result: { value: { status: number; text: string } }
      exceptionDetails?: { text: string }
    }
    if (exceptionDetails) return { status: 0, text: exceptionDetails.text }
    return result.value
  }
}
process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

// ---- poll loop --------------------------------------------------------------

await reopen()
log(
  `relay ${slug} (${format}): ${source} -> ${dumpPath || target} every ${intervalMs / 1000}s (match /${matchSource}/)`,
)

let lastPosted = ''
let failures = 0
for (;;) {
  try {
    const { status, text } = await fetchFeed()
    if (status !== 200) {
      failures++
      log(
        `source answered ${status}${failures >= 3 ? '; reopening the origin' : ''}`,
      )
      if (failures >= 3) {
        await reopen()
        failures = 0
      }
    } else {
      failures = 0
      const { ok, stamp, tag } = describe(text)
      if (dumpPath) {
        writeFileSync(dumpPath, text)
        log(`saved ${tag} to ${dumpPath}`)
        shutdown(0)
        break
      }
      if (!ok) {
        log(`skipped ${tag}`)
      } else if (!matches(text)) {
        log(`skipped ${tag} (not /${matchSource}/)`)
      } else if (stamp === lastPosted) {
        log(`unchanged ${tag}`)
      } else {
        const { status: code, body } = await post(text)
        log(
          `posted ${tag}: ${code} ${body.unchanged ? 'already stored' : body.message || body.code || 'stored'}`,
        )
        if (code < 300) lastPosted = stamp
      }
    }
  } catch (err) {
    log(`error: ${(err as Error).message}`)
  }
  if (args.has('once') || stopping) {
    shutdown(0)
    break
  }
  await sleep(intervalMs)
}
