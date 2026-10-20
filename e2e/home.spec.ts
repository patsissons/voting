import { expect, test } from '@playwright/test'

test('home page renders the app shell', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'voting' })).toBeVisible()
  // The shell must render even when the PocketBase backend is unreachable.
  await expect(page.getByText('Powered by PocketHost')).toBeVisible()
})
