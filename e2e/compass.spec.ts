import { expect, test } from '@playwright/test'

test('the compass runs from intro to results and keeps its permalink', async ({
  page,
}) => {
  await page.goto('/vancouver-2026#/compass')
  await expect(
    page.getByRole('heading', { name: 'Vancouver Votes 2026' }),
  ).toBeVisible()
  await page.getByRole('button', { name: /Start the compass/ }).click()
  await expect(page.getByText('Question 1 of 13')).toBeVisible()
  await expect(page).toHaveURL(/#\/compass\/-\/q0$/)
  // Answer the first question with its first option, counted double, then skip to the end.
  await page
    .getByRole('group', { name: 'Answers' })
    .getByRole('button')
    .first()
    .click()
  await page.getByRole('checkbox', { name: 'Counts double' }).first().click()
  await page.getByRole('button', { name: 'Next' }).first().click()
  await expect(page).toHaveURL(/#\/compass\/A\/q1$/)
  for (let i = 1; i < 13; i++)
    await page.getByRole('button', { name: 'Skip' }).first().click()
  await expect(page.getByRole('heading', { name: /Closest to/ })).toBeVisible()
  await expect(page).toHaveURL(/#\/compass\/A$/)
  await expect(
    page.getByRole('heading', { name: 'A ballot to start from' }),
  ).toBeVisible()

  // The answers survive a reload and the Compass tab points at them.
  await page.goto('/vancouver-2026#/results')
  await expect(page.getByRole('tab', { name: 'Results' })).toHaveAttribute(
    'data-state',
    'active',
  )
  await page.getByRole('tab', { name: 'Compass' }).click()
  await expect(page).toHaveURL(/#\/compass\/A$/)
  await expect(page.getByRole('heading', { name: /Closest to/ })).toBeVisible()
})

test('an old cubby.fyi compass link lands on the same results', async ({
  page,
}) => {
  await page.goto('/vancouver-2026#/compass/2--A--------1')
  await expect(
    page.getByText('Your results · 3 of 13 questions scored'),
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: /Closest to/ })).toBeVisible()
  const scores = await page.locator('ol li b').allTextContents()
  expect(scores.slice(0, 3)).toEqual(['58%', '50%', '50%'])
  await expect(page.getByRole('img', { name: /Parties and you/ })).toBeVisible()
})

test('a district compass offers a searchable riding picker', async ({
  page,
}) => {
  await page.goto('/bc-2026#/compass/000000000000000')
  await expect(page.getByRole('heading', { name: 'Your riding' })).toBeVisible()
  await page.getByRole('combobox', { name: 'Your riding' }).click()
  await page.getByPlaceholder('Search ridings').fill('Surrey South')
  await page.getByRole('option', { name: 'Surrey South' }).click()
  await expect(
    page.getByRole('heading', { name: 'Surrey South' }),
  ).toBeVisible()
  await expect(page.getByText('Elenore Sturko', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('combobox', { name: 'Your riding' })).toHaveText(
    'Surrey South',
  )
})

test('a cubby.fyi import link stores the riding and lands on the permalink', async ({
  page,
}) => {
  await page.goto('/bc-2026#/compass/import/410310311141132?d=SUS')
  await expect(page).toHaveURL(/#\/compass\/410310311141132$/)
  await expect(page.getByRole('heading', { name: /Closest to/ })).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Your riding' })).toHaveText(
    'Surrey South',
  )
  expect(
    await page.evaluate(() => localStorage.getItem('voting:bc-2026:district')),
  ).toBe('SUS')
  await page.reload()
  await expect(page.getByRole('combobox', { name: 'Your riding' })).toHaveText(
    'Surrey South',
  )
})

test('a cubby.fyi import link carries ballot swaps', async ({ page }) => {
  await page.goto('/vancouver-2026#/compass/import/2--A--------1?o=54')
  await expect(page).toHaveURL(/#\/compass\/2--A--------1$/)
  await expect(
    page.getByRole('button', { name: 'Swap Ken Sim back in' }),
  ).toBeVisible()
})

test('the referendum ballot marks questions into the hash', async ({
  page,
}) => {
  await page.goto('/alberta-2026#/compass')
  await expect(page.getByRole('tab', { name: 'Your ballot' })).toHaveAttribute(
    'data-state',
    'active',
  )
  await page.getByRole('button', { name: /^Remain/ }).click()
  await expect(page).toHaveURL(/#\/compass\/0$/)
  await page
    .getByRole('group', { name: 'Question 1' })
    .getByRole('button', { name: /^No/ })
    .click()
  await expect(page).toHaveURL(/#\/compass\/01$/)
  await expect(page.getByRole('heading', { name: 'Your ballot' })).toBeVisible()
  await page.goto('/alberta-2026#/compass/1-1')
  await expect(page.getByText('2 of 10 marked').first()).toBeVisible()
})
