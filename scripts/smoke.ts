// Smoke test against a running instance (local by default): the hooks
// bundle loads under goja, the admin routes check their token, the ingest
// stores a fixture snapshot and reports a repeat as unchanged, the fetch
// route answers, and the public API serves what the page needs.
//
//   pnpm smoke [--url http://127.0.0.1:8090] [--token <ingest token>]
//
// Against the local instance it also pushes the election documents first.
import assert from 'node:assert/strict'
import { feedText, fixtureFeeds } from './fixtures/fixture.ts'
import { argv, loadElection } from './lib/elections.ts'
import {
  LOCAL_INGEST_TOKEN,
  LOCAL_URL,
  PbClient,
  clientFor,
} from './lib/pb-client.ts'

const args = argv()
const url = (args.flag('url') || LOCAL_URL).replace(/\/$/, '')
const local = url === LOCAL_URL
const token =
  args.flag('token') ||
  process.env.VOTING_INGEST_TOKEN ||
  (local ? LOCAL_INGEST_TOKEN : '')
const anon = new PbClient(url)
let passed = 0
const check = async (name: string, fn: () => Promise<void>) => {
  try {
    await fn()
    passed++
    console.log(`ok   ${name}`)
  } catch (err) {
    console.error(`FAIL ${name}`)
    console.error(err)
    process.exitCode = 1
  }
}

if (local) {
  const admin = await clientFor({ flag: () => undefined, has: () => true })
  for (const slug of ['vancouver-2026', 'bc-2026', 'alberta-2026'])
    await admin.upsertElection(loadElection(slug))
}

const van = loadElection('vancouver-2026')
const feeds = fixtureFeeds(van)

await check(
  'the public API lists published elections without their config',
  async () => {
    const rows = await anon.list<{ slug: string; config?: unknown }>(
      'elections',
      { fields: 'id,slug,title,voting_day,ballot', sort: '-voting_day' },
    )
    assert.ok(rows.some((r) => r.slug === 'vancouver-2026'))
    assert.equal(rows[0].config, undefined)
  },
)

await check('the ingest refuses a missing or wrong token', async () => {
  const none = await anon.request(
    'POST',
    '/_voting/ingest/vancouver-2026',
    feedText(feeds[0]),
    { 'content-type': 'application/json' },
  )
  assert.equal(none.status, 401)
  const wrong = await anon.ingest('vancouver-2026', feedText(feeds[0]), 'nope')
  assert.equal(wrong.status, 401)
})

if (token) {
  await check(
    'the ingest stores a fixture snapshot, then calls a repeat unchanged',
    async () => {
      const first = await anon.ingest(
        'vancouver-2026',
        feedText(feeds[0]),
        token,
      )
      assert.ok(
        first.status === 201 || (first.status === 200 && first.body.unchanged),
        JSON.stringify(first),
      )
      const again = await anon.ingest(
        'vancouver-2026',
        feedText(feeds[0]),
        token,
      )
      assert.equal(again.status, 200)
      assert.equal(again.body.unchanged, true)
      const bad = await anon.ingest(
        'vancouver-2026',
        '<html>blocked</html>',
        token,
      )
      assert.equal(bad.status, 400)
      assert.equal(bad.body.code, 'bad_feed')
      const missing = await anon.ingest(
        'no-such-election',
        feedText(feeds[0]),
        token,
      )
      assert.equal(missing.status, 404)
    },
  )

  await check('the source route validates the page and clears', async () => {
    const bad = await anon.request<Record<string, unknown>>(
      'POST',
      '/_voting/source/bc-2026?url=http://127.0.0.1/x',
      undefined,
      { authorization: `Bearer ${token}` },
    )
    assert.equal(bad.status, 400)
    assert.equal(bad.body.code, 'bad_source')
    const clear = await anon.request<Record<string, unknown>>(
      'POST',
      '/_voting/source/bc-2026?url=',
      undefined,
      { authorization: `Bearer ${token}` },
    )
    assert.equal(clear.status, 200)
    assert.equal(clear.body.source, '')
  })
}

await check('the fetch route answers with per-election outcomes', async () => {
  const { status, body } = await anon.request<{ elections: unknown[] }>(
    'GET',
    '/_voting/fetch',
  )
  assert.equal(status, 200)
  assert.ok(Array.isArray(body.elections))
})

await check('results are public and carry the payload', async () => {
  const rows = await anon.list<{
    source_ts: string
    payload: { contests: unknown[] }
  }>('results', { sort: '-source_ts', perPage: '1' })
  if (token) {
    assert.ok(rows.length >= 1)
    assert.ok(rows[0].payload.contests.length > 0)
  }
})

console.log(`\n${passed} passed${process.exitCode ? ', with failures' : ''}`)
