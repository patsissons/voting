import { defineConfig, devices } from '@playwright/test'

// E2e runs against `vite dev` on port 5198 (not 5173), so a normally-running
// dev server is never reused. Later rounds move this to the built app served
// by a local PocketBase, so the hooks, OG rewrite and MCP are exercised too.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:5198',
    trace: 'on-first-retry',
    reducedMotion: 'reduce',
  },
  projects: [
    { name: 'desktop-chrome', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 14'] } },
  ],
  webServer: {
    command: 'pnpm dev --port 5198 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:5198/',
    reuseExistingServer: false,
  },
})
