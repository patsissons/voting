// Local development: the hooks bundle (built once, then rebuilt on change),
// the local PocketBase on 8090 (scripts/pb.ts, which restarts its hooks when
// the bundle changes) and Vite on 5173 proxying the API to it.
//
//   pnpm dev            (first time: `pnpm dev -- --seed` loads the elections
//                        and fixture nights into .pb/pb_data)
import { spawn, spawnSync } from 'node:child_process'
import path from 'node:path'
import { root } from './lib/elections.ts'

const extra = process.argv.slice(2)
const node = process.execPath

const built = spawnSync(node, [path.join(root, 'scripts', 'build-hooks.ts')], {
  stdio: 'inherit',
})
if (built.status !== 0) process.exit(built.status ?? 1)

const children = [
  spawn(node, [path.join(root, 'scripts', 'build-hooks.ts'), '--watch'], {
    stdio: 'inherit',
  }),
  spawn(node, [path.join(root, 'scripts', 'pb.ts'), ...extra], {
    stdio: 'inherit',
  }),
  spawn('pnpm', ['exec', 'vite'], { stdio: 'inherit', cwd: root }),
]

const stop = () => {
  for (const child of children) child.kill()
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
for (const child of children) {
  child.on('exit', (code) => {
    stop()
    process.exit(code ?? 0)
  })
}
