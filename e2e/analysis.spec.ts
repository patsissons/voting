import { expect, test } from '@playwright/test'

test('the analysis tab opens from its hash and trades places with results', async ({
  page,
}) => {
  await page.goto('/alberta-2026#/analysis')
  const analysis = page.getByRole('tab', { name: 'Analysis' })
  await expect(analysis).toHaveAttribute('data-state', 'active')
  await expect(
    page.getByRole('heading', {
      name: 'One axis explains every answer',
      level: 2,
    }),
  ).toBeVisible()
  await expect(
    page.getByRole('img', { name: /^Question 1 against Question 10/ }),
  ).toBeVisible()
  await expect(page.locator('#axis .viz-scatter-dot')).toHaveCount(87)
  await expect(
    page.getByRole('heading', { name: 'Every division', level: 2 }),
  ).toBeVisible()

  await page.getByRole('tab', { name: 'Results' }).click()
  await expect(page).toHaveURL(/#\/results$/)
  await analysis.click()
  await expect(page).toHaveURL(/#\/analysis$/)
  await expect(analysis).toHaveAttribute('data-state', 'active')
})

test('the division table sorts and filters', async ({ page }) => {
  await page.goto('/alberta-2026#/analysis')
  const table = page.locator('#divisions table')
  await table.scrollIntoViewIfNeeded()
  await page
    .getByRole('searchbox', { name: 'Find a division or region' })
    .fill('calgary')
  await expect(table.locator('tbody tr')).toHaveCount(26)
  const name = table.getByRole('columnheader', { name: /^Division/ })
  await name.getByRole('button').click()
  await expect(name).toHaveAttribute('aria-sort', 'ascending')
  await expect(table.locator('tbody tr').first()).toContainText(
    'Calgary-Acadia',
  )
})

test('an election without an analysis has no analysis tab', async ({
  page,
}) => {
  await page.goto('/bc-2026#/analysis')
  await expect(page.getByRole('tab', { name: 'Results' })).toHaveAttribute(
    'data-state',
    'active',
  )
  await expect(page.getByRole('tab', { name: 'Analysis' })).toHaveCount(0)
})
