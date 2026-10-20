import { expect, test } from '@playwright/test'

test('a page with results opens on them and shows the at-large sections', async ({
  page,
}) => {
  await page.goto('/vancouver-2026')
  await expect(page.getByRole('tab', { name: 'Results' })).toHaveAttribute(
    'data-state',
    'active',
  )
  await expect(
    page.getByText('Count complete · last update Oct 17, 11:40 pm'),
  ).toBeVisible()
  await expect(page.getByText('of 147 · 100.0%')).toBeVisible()
  for (const name of [
    'Mayor',
    'Council',
    'Park Board',
    'School Board',
    'Seats across City Hall',
    'Council field by party',
  ]) {
    await expect(
      page.getByRole('heading', { name, exact: true, level: 2 }),
    ).toBeVisible()
  }
  await page
    .getByRole('navigation', { name: 'Results sections' })
    .getByRole('link', { name: 'The parties' })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Party share by office' }),
  ).toBeInViewport()
  // Charts answer to the keyboard with the shared tooltip.
  const chart = page
    .getByRole('img', { name: 'Mayoral vote share as voting places reported' })
    .locator('rect.viz-hit')
  await chart.focus()
  await expect(page.getByRole('status')).toContainText('reported')
})

test('the riding election shows seats, every riding and the closest races', async ({
  page,
}) => {
  await page.goto('/bc-2026#/results')
  await expect(page.getByText(/47 for a majority/)).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Every riding' }),
  ).toBeVisible()
  await page
    .getByRole('searchbox', { name: 'Find a riding or candidate' })
    .fill('Surrey South')
  await page.getByText('Surrey South', { exact: true }).first().click()
  await expect(page.getByText('Elenore Sturko').first()).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Closest ridings' }),
  ).toBeVisible()
  await expect(
    page.getByRole('img', {
      name: /Ridings led by party on the compass plane/,
    }),
  ).toBeVisible()
})

test('the referendum shows every question and the divisions', async ({
  page,
}) => {
  await page.goto('/alberta-2026#/results')
  await expect(page.getByText('Questions reporting')).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Separation', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('img', { name: /Remain .*, Begin process/ }).first(),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'By electoral division' }),
  ).toBeVisible()
  await page.getByRole('combobox', { name: 'Your division' }).click()
  await page.getByRole('option', { name: 'Edmonton-McClung' }).click()
  await expect(page.getByText(/Edmonton-McClung.*of .* votes/)).toBeVisible()
})
