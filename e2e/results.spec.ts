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

test('the riding map blends every riding and describes it', async ({
  page,
}) => {
  await page.goto('/bc-2026#/results')
  const map = page.locator('#map')
  await map.scrollIntoViewIfNeeded()
  const province = map.locator('[data-frame=province]')
  await expect(province.locator('path[data-code]')).toHaveCount(93)
  await expect(map.locator('[data-frame=metro]')).toBeVisible()
  const riding = province.locator('path[data-code="PCN"]')
  await expect(riding).toHaveAttribute('fill', /var\(--party-/)
  await riding.focus()
  await expect(page.getByRole('status')).toContainText('Peace River North')
})

test('the referendum map follows the question picked', async ({ page }) => {
  await page.goto('/alberta-2026#/results')
  const map = page.locator('#map')
  await map.scrollIntoViewIfNeeded()
  const division = map.locator('[data-frame=province] path[data-code="87"]')
  await expect(division).toHaveAttribute('fill', /var\(--ref-/)
  const before = await division.getAttribute('fill')
  await map.getByRole('combobox', { name: 'Map question' }).click()
  await page.getByRole('option', { name: /^Q1 / }).click()
  await expect(map.getByText('Question 1 by electoral division')).toBeVisible()
  await expect(division).not.toHaveAttribute('fill', before!)
  // Your division, picked in the list below, is outlined on the map too.
  await page.getByRole('combobox', { name: 'Your division' }).click()
  await page.getByRole('option', { name: 'Edmonton-McClung' }).click()
  await expect(map.locator('path[data-ring="36"]')).toHaveCount(2)
})

test('the results-only election has no tabs and shows every chamber', async ({
  page,
}) => {
  await page.goto('/us-2026')
  await expect(
    page.getByRole('heading', { name: 'House of Representatives', level: 2 }),
  ).toBeVisible()
  expect(await page.getByRole('tab').count()).toBe(0)
  expect(await page.evaluate(() => window.location.hash)).toBe('#/results')
  for (const name of ['Your state', 'Senate', 'Governors']) {
    await expect(
      page.getByRole('heading', { name, exact: true, level: 2 }),
    ).toBeVisible()
  }
  await expect(page.getByText('Races called', { exact: true })).toBeVisible()
  const house = page.locator('#house-balance')
  await expect(
    house.getByRole('img', { name: /218 for a majority/ }),
  ).toBeVisible()
  await expect(house.getByText(/^(Dem|GOP) \d+ · (Dem|GOP) \d+/)).toBeVisible()

  await page.getByRole('combobox', { name: 'Your state' }).click()
  await page.getByRole('option', { name: 'Alaska' }).click()
  await expect(
    page.getByRole('heading', { name: 'Your state: Alaska', level: 2 }),
  ).toBeVisible()
  await expect(
    page.locator('#mine').getByRole('heading', {
      name: 'House of Representatives: Alaska at-large',
    }),
  ).toBeVisible()
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'Your state: Alaska', level: 2 }),
  ).toBeVisible()
})

test('the US maps draw every district and every state', async ({ page }) => {
  await page.goto('/us-2026')
  const house = page.locator('#house-map')
  await house.scrollIntoViewIfNeeded()
  const districts = house.locator('[data-frame=province]')
  await expect(districts.locator('path[data-code]')).toHaveCount(435)
  await expect(house.locator('[data-frame=nyc]')).toBeVisible()
  const called = districts.locator('path[data-code][fill^="var(--party-"]')
  expect(await called.count()).toBeGreaterThan(100)
  const senate = page.locator('#senate-map')
  await senate.scrollIntoViewIfNeeded()
  const states = senate.locator('[data-frame=province]')
  await expect(states.locator('path[data-code]')).toHaveCount(50)
  await states.locator('path[data-code="ak"]').focus()
  await expect(page.getByRole('status')).toContainText('Alaska')
})
