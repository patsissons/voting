import { expect, test } from '@playwright/test'

test('the shell renders and the theme toggle persists', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Elections' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Voting' })).toBeVisible()

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
