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
  await page.goto('/vancouver-2026#/analysis')
  await expect(page.getByRole('tab', { name: 'Results' })).toHaveAttribute(
    'data-state',
    'active',
  )
  await expect(page.getByRole('tab', { name: 'Analysis' })).toHaveCount(0)
})

test('the BC analysis compares every riding with 2024', async ({ page }) => {
  await page.goto('/bc-2026#/analysis')
  await expect(page.getByRole('tab', { name: 'Analysis' })).toHaveAttribute(
    'data-state',
    'active',
  )
  await expect(
    page.getByRole('heading', { name: 'The swing from 2024', level: 2 }),
  ).toBeVisible()
  await expect(page.locator('#swing .viz-scatter-dot')).toHaveCount(93)
  const table = page.locator('#ridings table')
  await table.scrollIntoViewIfNeeded()
  await page
    .getByRole('searchbox', { name: 'Find a riding or region' })
    .fill('surrey')
  await expect(table.locator('tbody tr')).toHaveCount(10)
})

test('the US analysis sets every race against 2024 and its rating', async ({
  page,
}) => {
  await page.goto('/us-2026#/analysis')
  await expect(page.getByRole('tab', { name: 'Analysis' })).toHaveAttribute(
    'data-state',
    'active',
  )
  await expect(
    page.getByRole('heading', { name: 'The swing from 2024', level: 2 }),
  ).toBeVisible()
  // The 236 districts with a 2024 race to compare, then the 71 Senate and
  // governor's races against the presidential vote.
  await expect(page.locator('#swing .viz-scatter-dot')).toHaveCount(307)
  await expect(page.locator('#ratings .viz-scatter-dot')).toHaveCount(435)
  const table = page.locator('#races table')
  await table.scrollIntoViewIfNeeded()
  await page
    .getByRole('searchbox', { name: 'Find a race, state or winner' })
    .fill('texas')
  await expect(table.locator('tbody tr')).toHaveCount(40)
  // A results-only election keeps the hash of the tab it shows.
  await page.getByRole('tab', { name: 'Results' }).click()
  await expect(page).toHaveURL(/#\/results$/)
  await expect(
    page.getByRole('heading', { name: 'House of Representatives', level: 2 }),
  ).toBeVisible()
  await page.getByRole('tab', { name: 'Analysis' }).click()
  await expect(page).toHaveURL(/#\/analysis$/)
})
