import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TipProvider } from '@/components/charts/tooltip'
import { feedText, fixtureFeeds } from '../../../../scripts/fixtures/fixture.ts'
import { us, usEarlyVote } from '../../../../scripts/fixtures/load.ts'
import type { EarlyVote } from '../../../../shared/early-vote.ts'
import { normalize } from '../../../../shared/parsers/index.ts'
import UsAnalysis from './analysis'

const e = us()
const night = fixtureFeeds(e).map((f, i) => ({
  id: `r${i}`,
  source_ts: '',
  official: false,
  polls_closed: 0,
  polls_total: 0,
  payload: normalize(feedText(f), e),
}))

const mount = (
  snapshots = night,
  earlyVote: EarlyVote | null = usEarlyVote(e),
) => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => 640,
  })
  return render(
    <TipProvider>
      <UsAnalysis
        election={e}
        snapshots={snapshots}
        earlyVote={earlyVote}
        live={false}
      />
    </TipProvider>,
  )
}

describe('us analysis', () => {
  it('lays out every section over the fixture night', () => {
    mount()
    for (const name of [
      'Key findings',
      'The swing from 2024',
      'Ratings against the result',
      'Seats that changed hands',
      'Seats against votes',
      'The early vote against the result',
      'How the count moved',
      'Every race',
      'Notes and sources',
    ])
      expect(
        screen.getByRole('heading', { name, level: 2 }),
      ).toBeInTheDocument()
    expect(
      screen.getByRole('navigation', { name: 'Analysis sections' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('img', {
        name: /^Each House district's Democratic lead over the Republican, 2024 against 2026/,
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('img', {
        name: /^House of Representatives: each race's margin by its pre-election rating/,
      }),
    ).toBeInTheDocument()
    // The race table alone has a row per race.
    expect(screen.getAllByRole('row').length).toBeGreaterThan(506)
    expect(document.body.textContent).not.toMatch(/undefined|NaN|Infinity/)
  })

  it('leaves the early vote out without one', () => {
    mount(night, null)
    expect(
      screen.queryByRole('heading', {
        name: 'The early vote against the result',
      }),
    ).toBeNull()
    expect(
      screen.getByRole('heading', { name: 'Every race', level: 2 }),
    ).toBeInTheDocument()
  })

  it('waits for the count by race', () => {
    mount([])
    expect(
      screen.getByText(/arrives with the first results/),
    ).toBeInTheDocument()
  })
})
