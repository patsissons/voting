import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TipProvider } from '@/components/charts/tooltip'
import { feedText, fixtureFeeds } from '../../../../scripts/fixtures/fixture.ts'
import { bc, bcEarlyVote } from '../../../../scripts/fixtures/load.ts'
import { normalize } from '../../../../shared/parsers/index.ts'
import BcAnalysis from './analysis'

const e = bc()
const night = fixtureFeeds(e).map((f, i) => ({
  id: `r${i}`,
  source_ts: '',
  official: false,
  polls_closed: 0,
  polls_total: 0,
  payload: normalize(feedText(f), e),
}))

describe('bc analysis', () => {
  it('lays out every section over the fixture night', () => {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get: () => 640,
    })
    render(
      <TipProvider>
        <BcAnalysis
          election={e}
          snapshots={night}
          earlyVote={bcEarlyVote()}
          live={false}
        />
      </TipProvider>,
    )
    for (const name of [
      'Key findings',
      'The swing from 2024',
      'Seats against votes',
      'Minor parties and margins',
      'Turnout and the advance vote',
      'What the final count could change',
      'Every riding',
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
        name: /^Each riding's Conservative lead over the NDP, 2024 against 2026/,
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /^Advance ballots against 2024/ }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('row').length).toBeGreaterThan(93)
  })

  it('leaves the advance vote out without one', () => {
    render(
      <TipProvider>
        <BcAnalysis election={e} snapshots={night} live={false} />
      </TipProvider>,
    )
    expect(
      screen.queryByRole('heading', { name: /^Advance ballots against 2024/ }),
    ).toBeNull()
  })

  it('waits for the ridings', () => {
    render(<BcAnalysis election={e} snapshots={[]} live={false} />)
    expect(
      screen.getByText(/arrives with the first results/),
    ).toBeInTheDocument()
  })
})
