/// <reference types="vitest/config" />
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  build: {
    // PocketBase serves pb_public/ directly on the instance URL.
    outDir: 'pb_public',
    emptyOutDir: true,
  },
  server: {
    // Everything that is not the Vite app goes to the local PocketBase
    // (scripts/pb.ts): the API and realtime stream, the admin UI, the hooks'
    // routes, and the markdown pages. Vite's SPA fallback answers /<slug>
    // itself, so the OG rewrite only runs on the built app.
    proxy: Object.fromEntries(
      [
        '/api',
        '/_/',
        '/mcp',
        '/_voting',
        '/llms.txt',
        '^/[a-z0-9-]+\\.md$',
      ].map((prefix) => [
        prefix,
        { target: 'http://127.0.0.1:8090', changeOrigin: false },
      ]),
    ),
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['{src,shared,server,scripts}/**/*.test.{ts,tsx}'],
  },
})
