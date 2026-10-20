// Bundles server/lib.ts (and everything under shared/ it imports) into
// pb_hooks/lib/voting.js for PocketBase's goja JSVM: CommonJS, es2020 (goja
// has optional chaining and ??; class fields are lowered), no minify so stack
// traces read, no npm packages (zod never reaches the hooks: the push script
// validates documents in Node, the hooks use shared/config-guard.ts).
//
//   pnpm build:hooks            one build
//   node scripts/build-hooks.ts --watch   rebuild on change (scripts/dev.ts)
import * as esbuild from 'esbuild'
import path from 'node:path'
import { argv, root } from './lib/elections.ts'

const args = argv()
const outfile = path.join(root, 'pb_hooks', 'lib', 'voting.js')

const options: esbuild.BuildOptions = {
  entryPoints: [path.join(root, 'server', 'lib.ts')],
  outfile,
  bundle: true,
  format: 'cjs',
  platform: 'neutral',
  mainFields: ['module', 'main'],
  target: 'es2020',
  minify: false,
  sourcemap: false,
  legalComments: 'none',
  banner: {
    js: '// Built by scripts/build-hooks.ts from server/ and shared/. Do not edit.',
  },
  plugins: [
    {
      name: 'no-npm-in-hooks',
      setup(build) {
        // Anything that is not a relative file is a package: refuse it, so a
        // stray `import { z } from 'zod'` in server/ fails the build instead
        // of the instance at boot.
        build.onResolve({ filter: /^[^./]/ }, (resolve) => ({
          errors: [
            {
              text: `"${resolve.path}" is an npm package; the hooks bundle must stay dependency-free (imported from ${resolve.importer})`,
            },
          ],
        }))
      },
    },
  ],
}

if (args.has('watch')) {
  const ctx = await esbuild.context(options)
  await ctx.watch()
  console.log(
    `[hooks] watching server/ and shared/ -> ${path.relative(root, outfile)}`,
  )
} else {
  await esbuild.build(options)
  console.log(`[hooks] built ${path.relative(root, outfile)}`)
}
