// A small PocketBase REST client for the scripts: superuser auth, paced
// writes (PocketHost allows 50 requests per 10 s per IP and 1,000 an hour,
// and answers 429 with Retry-After), election upserts and fixture ingests.
import { toRow } from '../../shared/election-row.ts'
import type { Election } from '../../shared/schema/election.ts'
import { feedText, fixtureFeeds } from '../fixtures/fixture.ts'

export const LOCAL_URL = 'http://127.0.0.1:8090'
export const LOCAL_SUPERUSER = {
  email: 'local@voting.test',
  password: 'voting-local-dev',
}
export const LOCAL_INGEST_TOKEN = 'local-ingest-token'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export type Credentials = { email: string; password: string }

export class PbClient {
  baseUrl: string
  token = ''
  private last = 0
  /** Minimum gap between requests: 20 starts per 10 s stays well inside PocketHost's limit. */
  gapMs: number

  constructor(baseUrl: string, { gapMs = 0 }: { gapMs?: number } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.gapMs = gapMs
  }

  async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<{ status: number; body: T }> {
    for (let attempt = 0; ; attempt++) {
      const wait = this.last + this.gapMs - Date.now()
      if (wait > 0) await sleep(wait)
      this.last = Date.now()
      const res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          ...(body !== undefined && typeof body !== 'string'
            ? { 'content-type': 'application/json' }
            : {}),
          ...(this.token ? { authorization: this.token } : {}),
          ...headers,
        },
        body:
          body === undefined
            ? undefined
            : typeof body === 'string'
              ? body
              : JSON.stringify(body),
      })
      if (res.status === 429 && attempt < 5) {
        const retry = Number(res.headers.get('retry-after')) || 5
        await sleep(retry * 1000)
        continue
      }
      const text = await res.text()
      let parsed: unknown = text
      try {
        parsed = text ? JSON.parse(text) : {}
      } catch {
        // not JSON
      }
      return { status: res.status, body: parsed as T }
    }
  }

  async authenticate(creds: Credentials): Promise<void> {
    const { status, body } = await this.request<{
      token?: string
      message?: string
    }>('POST', '/api/collections/_superusers/auth-with-password', {
      identity: creds.email,
      password: creds.password,
    })
    if (status !== 200 || !body.token)
      throw new Error(
        `superuser auth failed (${status}): ${body.message || JSON.stringify(body)}`,
      )
    this.token = body.token
  }

  async health(): Promise<boolean> {
    try {
      const { status } = await this.request('GET', '/api/health')
      return status === 200
    } catch {
      return false
    }
  }

  async list<T>(
    collection: string,
    query: Record<string, string>,
  ): Promise<T[]> {
    const out: T[] = []
    for (let page = 1; ; page++) {
      const params = new URLSearchParams({
        perPage: '200',
        page: String(page),
        ...query,
      })
      const { status, body } = await this.request<{
        items: T[]
        totalPages: number
        message?: string
      }>('GET', `/api/collections/${collection}/records?${params}`)
      if (status !== 200)
        throw new Error(
          `list ${collection} failed (${status}): ${body.message || JSON.stringify(body)}`,
        )
      out.push(...body.items)
      if (page >= body.totalPages) break
    }
    return out
  }

  /** Creates or updates the election row for a document; returns what happened. */
  async upsertElection(
    doc: Election,
    extra: Record<string, unknown> = {},
  ): Promise<{ id: string; action: 'created' | 'updated' | 'unchanged' }> {
    const row = { ...toRow(doc), ...extra }
    const filter = encodeURIComponent(`slug = "${doc.slug}"`)
    const found = await this.request<{
      items: ({ id: string } & Record<string, unknown>)[]
    }>('GET', `/api/collections/elections/records?filter=${filter}&perPage=1`)
    const existing = found.status === 200 ? found.body.items[0] : undefined
    if (existing) {
      const same = (Object.keys(row) as (keyof typeof row)[]).every(
        (k) => JSON.stringify(existing[k]) === JSON.stringify(row[k]),
      )
      if (same) return { id: existing.id, action: 'unchanged' }
      const { status, body } = await this.request<{
        message?: string
        data?: unknown
      }>('PATCH', `/api/collections/elections/records/${existing.id}`, row)
      if (status !== 200)
        throw new Error(
          `update ${doc.slug} failed (${status}): ${body.message} ${JSON.stringify(body.data || '')}`,
        )
      return { id: existing.id, action: 'updated' }
    }
    const { status, body } = await this.request<{
      id: string
      message?: string
      data?: unknown
    }>('POST', '/api/collections/elections/records', row)
    if (status !== 200)
      throw new Error(
        `create ${doc.slug} failed (${status}): ${body.message} ${JSON.stringify(body.data || '')}`,
      )
    return { id: body.id, action: 'created' }
  }

  /** Posts one raw results document to the ingest route. */
  async ingest(
    slug: string,
    text: string,
    token: string,
    official = false,
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    return this.request<Record<string, unknown>>(
      'POST',
      `/_voting/ingest/${slug}${official ? '?official=1' : ''}`,
      text,
      {
        'content-type': text.trimStart().startsWith('<')
          ? 'text/html'
          : 'application/json',
        authorization: `Bearer ${token}`,
      },
    )
  }

  /** Posts a whole fixture night for an election. */
  async ingestFixtures(
    doc: Election,
    token: string,
    { steps }: { steps?: number } = {},
  ): Promise<{ status: number; body: Record<string, unknown> }[]> {
    const feeds = fixtureFeeds(doc)
    const out = []
    for (const feed of steps ? feeds.slice(0, steps) : feeds)
      out.push(await this.ingest(doc.slug, feedText(feed), token))
    return out
  }
}

/** Where a script talks to: --local (the scripts/pb.ts instance) or --url with PB_SUPERUSER_EMAIL/PASSWORD. */
export async function clientFor(
  args: {
    flag: (n: string) => string | undefined
    has: (n: string) => boolean
  },
  { gapMs = 500 } = {},
): Promise<PbClient> {
  const local = args.has('local') || !args.flag('url')
  const url = args.flag('url') || LOCAL_URL
  const client = new PbClient(url, { gapMs: local ? 0 : gapMs })
  const creds = local
    ? LOCAL_SUPERUSER
    : {
        email:
          process.env.PB_SUPERUSER_EMAIL ||
          process.env.VOTING_SUPERUSER_EMAIL ||
          '',
        password:
          process.env.PB_SUPERUSER_PASSWORD ||
          process.env.VOTING_SUPERUSER_PASSWORD ||
          '',
      }
  if (!creds.email || !creds.password)
    throw new Error(
      'set PB_SUPERUSER_EMAIL and PB_SUPERUSER_PASSWORD for the instance (or pass --local)',
    )
  await client.authenticate(creds)
  return client
}
