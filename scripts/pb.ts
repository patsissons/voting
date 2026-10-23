// Local PocketBase: downloads and caches the binary in .pb/, ensures a local
// superuser, and serves the repo's pb_hooks, pb_migrations and pb_public on
// http://127.0.0.1:8090 (admin UI at /_/, local@voting.test / voting-local-dev).
//
//   pnpm pb                    serve with .pb/pb_data
//   pnpm pb --e2e              a throwaway data dir seeded with the election
//                              documents and the fixture nights (Playwright's
//                              webServer; it needs `pnpm build` first)
//   pnpm pb --seed             seed the dev data dir the same way, then serve
//
// The ingest token for the local instance is "local-ingest-token" (or
// VOTING_INGEST_TOKEN from the environment). PB_VERSION overrides the
// PocketBase version (track PocketHost's supported line).
import { spawn, spawnSync } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { earlyVoteFixture } from './fixtures/load.ts'
import { argv, loadElections, root } from './lib/elections.ts'
import {
  LOCAL_INGEST_TOKEN,
  LOCAL_SUPERUSER,
  LOCAL_URL,
  PbClient,
} from './lib/pb-client.ts'

export const PB_VERSION = process.env.PB_VERSION || '0.39.10'
const pbDir = path.join(root, '.pb')
export const binary = path.join(pbDir, `pocketbase-${PB_VERSION}`)

export async function ensureBinary(): Promise<string> {
  if (existsSync(binary)) return binary
  mkdirSync(pbDir, { recursive: true })
  const os = (
    { darwin: 'darwin', linux: 'linux', win32: 'windows' } as Record<
      string,
      string
    >
  )[process.platform]
  const arch = ({ arm64: 'arm64', x64: 'amd64' } as Record<string, string>)[
    process.arch
  ]
  if (!os || !arch)
    throw new Error(`unsupported platform ${process.platform}/${process.arch}`)
  const url = `https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_${os}_${arch}.zip`
  console.log(`[pb] downloading ${url}`)
  const res = await fetch(url)
  if (!res.ok || !res.body)
    throw new Error(`download failed: ${res.status} ${res.statusText}`)
  const zipPath = path.join(pbDir, 'pocketbase.zip')
  await pipeline(
    Readable.fromWeb(res.body as never),
    createWriteStream(zipPath),
  )
  const unzip = spawnSync('unzip', ['-o', zipPath, 'pocketbase', '-d', pbDir], {
    stdio: 'inherit',
  })
  if (unzip.status !== 0) throw new Error('unzip failed')
  spawnSync('mv', [path.join(pbDir, 'pocketbase'), binary])
  spawnSync('chmod', ['+x', binary])
  rmSync(zipPath, { force: true })
  console.log(`[pb] cached ${binary}`)
  return binary
}

export type ServeOptions = {
  dataDir: string
  addr?: string
  env?: Record<string, string>
  /** Restart the hooks when pb_hooks changes (off for e2e: a late file event mid-seed would drop the connection). */
  watch?: boolean
}

export function serveArgs(dataDir: string): string[] {
  return [
    '--dir',
    dataDir,
    '--hooksDir',
    path.join(root, 'pb_hooks'),
    '--migrationsDir',
    path.join(root, 'pb_migrations'),
  ]
}

export function ensureSuperuser(dataDir: string): void {
  // Superusers live in their own system collection; this never touches app data.
  const result = spawnSync(
    binary,
    [
      'superuser',
      'upsert',
      LOCAL_SUPERUSER.email,
      LOCAL_SUPERUSER.password,
      ...serveArgs(dataDir),
    ],
    { stdio: 'inherit' },
  )
  if (result.status !== 0)
    console.warn('[pb] superuser upsert failed (continuing)')
}

export function startServer({
  dataDir,
  addr = '127.0.0.1:8090',
  env = {},
  watch = true,
}: ServeOptions) {
  return spawn(
    binary,
    [
      'serve',
      '--http',
      addr,
      '--publicDir',
      path.join(root, 'pb_public'),
      `--hooksWatch=${watch}`,
      ...serveArgs(dataDir),
    ],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        VOTING_INGEST_TOKEN:
          process.env.VOTING_INGEST_TOKEN || LOCAL_INGEST_TOKEN,
        ...env,
      },
    },
  )
}

export async function waitForHealth(
  client: PbClient,
  timeoutMs = 30000,
): Promise<void> {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    if (await client.health()) return
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('PocketBase did not come up')
}

/** Pushes every election document and posts each one's fixture night. */
export async function seed(
  baseUrl = LOCAL_URL,
  token = process.env.VOTING_INGEST_TOKEN || LOCAL_INGEST_TOKEN,
): Promise<void> {
  const client = new PbClient(baseUrl)
  await waitForHealth(client)
  await client.authenticate(LOCAL_SUPERUSER)
  for (const doc of loadElections()) {
    await waitForHealth(client)
    const { id, action } = await client.upsertElection(doc)
    const early = earlyVoteFixture(doc)
    if (early)
      await client.patchElection(id, {
        early_vote: early,
        early_vote_checked: early.asOf.replace('T', ' '),
      })
    const posted = await client.ingestFixtures(doc, token)
    const stored = posted.filter((p) => p.status === 201).length
    const bad = posted.find((p) => p.status >= 400)
    console.log(
      `[pb] ${doc.slug}: election ${action}${early ? ', early vote seeded' : ''}, ${stored} of ${posted.length} fixture snapshots stored${bad ? ` (${bad.status} ${JSON.stringify(bad.body)})` : ''}`,
    )
    if (bad) throw new Error(`seeding ${doc.slug} failed`)
  }
}

async function main() {
  const args = argv()
  await ensureBinary()
  const e2e = args.has('e2e')
  const dataDir = path.join(pbDir, e2e ? 'e2e_data' : 'pb_data')
  if (e2e) rmSync(dataDir, { recursive: true, force: true })
  mkdirSync(dataDir, { recursive: true })
  ensureSuperuser(dataDir)
  const addr = args.flag('addr') || '127.0.0.1:8090'
  if (e2e || args.has('seed')) {
    // Seed on a side port first, so nothing waiting on the real port (the
    // Playwright webServer health check) sees a half-seeded instance.
    const side = '127.0.0.1:8099'
    const seeder = startServer({ dataDir, addr: side, watch: false })
    try {
      await waitForHealth(new PbClient(`http://${side}`))
      await seed(`http://${side}`)
    } catch (err) {
      console.error(err)
      seeder.kill()
      process.exit(1)
    }
    seeder.kill()
    await new Promise((resolve) => seeder.on('exit', resolve))
  }
  const server = startServer({ dataDir, addr, watch: !e2e })
  const stop = () => server.kill()
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
  server.on('exit', (code) => process.exit(code ?? 0))
  const baseUrl = `http://${addr}`
  await waitForHealth(new PbClient(baseUrl))
  console.log(
    `[pb] ${baseUrl}/ (admin: ${baseUrl}/_/ as ${LOCAL_SUPERUSER.email})`,
  )
}

if (
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href
) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
