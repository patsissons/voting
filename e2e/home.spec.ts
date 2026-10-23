import { expect, test } from '@playwright/test'

test('the index lists the elections and the theme toggle persists', async ({
  page,
}) => {
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'Know your ballot. Watch the count.' }),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: 'Voting' })).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'BC Votes 2026' }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Alberta Votes 2026' }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Vancouver Votes 2026' }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'US Midterms 2026' }),
  ).toBeVisible()
  await expect(page.getByText('Live results', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('link', { name: /BC Votes 2026/ }),
  ).toHaveAttribute('href', '/bc-2026')

  const html = page.locator('html')
  const wasDark = await html.evaluate((el) => el.classList.contains('dark'))
  await page
    .getByRole('button', {
      name: `Switch to ${wasDark ? 'light' : 'dark'} mode`,
    })
    .click()
  await expect(html).toHaveClass(wasDark ? /^(?!.*dark)/ : /dark/)

  // theme-init.js replays the stored choice before first paint.
  await page.reload()
  expect(await html.evaluate((el) => el.classList.contains('dark'))).toBe(
    !wasDark,
  )
})

test('an unknown slug shows the not-found page', async ({ page }) => {
  await page.goto('/no-such-election')
  await expect(
    page.getByRole('heading', { name: 'Election not found' }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'See all elections' }),
  ).toHaveAttribute('href', '/')
})
