import { defineConfig, devices } from '@playwright/test'

// E2e runs against the built app served by a local PocketBase
// (scripts/pb.ts --e2e: a throwaway data dir seeded with the election
// documents and the fixture nights), not against Vite, so the hooks bundle,
// the OG rewrite, the markdown pages and the MCP endpoint are exercised too.
// Port 8090 is the same one `pnpm dev` uses: stop the dev server first.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:8090',
    trace: 'on-first-retry',
    reducedMotion: 'reduce',
  },
  projects: [
    { name: 'desktop-chrome', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 14'] } },
  ],
  webServer: {
    command: 'pnpm build && node scripts/pb.ts --e2e',
    url: 'http://127.0.0.1:8090/api/health',
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
