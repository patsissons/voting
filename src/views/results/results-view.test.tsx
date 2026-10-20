import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TipProvider } from '@/components/charts/tooltip'
import { feedText, fixtureFeeds } from '../../../scripts/fixtures/fixture.ts'
import { alberta, bc, vancouver } from '../../../scripts/fixtures/load.ts'
import { normalize } from '../../../shared/parsers/index.ts'
import type { Election } from '../../../shared/schema/election.ts'
import { ResultsView } from './results-view'

const night = (e: Election) =>
  fixtureFeeds(e).map((f, i) => ({
    id: `r${i}`,
    source_ts: '',
    official: false,
    polls_closed: 0,
    polls_total: 0,
    payload: normalize(feedText(f), e),
  }))

function mount(
  e: Election,
  snapshots = night(e),
  matchParty: string | null = null,
) {
  render(
    <TipProvider>
      <ResultsView
        election={e}
        snapshots={snapshots}
        live
        matchParty={matchParty}
        marks={{ 0: 0 }}
      />
    </TipProvider>,
  )
}

describe('ResultsView', () => {
  it('waits before any count', () => {
    mount(vancouver(), [])
    expect(
      screen.getByRole('heading', { name: 'No results yet' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'the ballot compass' }),
    ).toHaveAttribute('href', '/vancouver-2026#/compass')
  })

  it('renders every at-large section', () => {
    mount(vancouver(), undefined, 'abc')
    for (const name of [
      'Mayor',
      'Council',
      'Park Board',
      'School Board',
      'Ballot questions',
      'How the mayoral race moved',
      "What's left to count",
      'Mayor momentum',
      'Race for the last seats',
      'Seats across City Hall',
      'Party share by office',
      'The new council on the compass',
      'Council field by party',
    ]) {
      expect(
        screen.getByRole('heading', { name, level: 2 }),
        name,
      ).toBeInTheDocument()
    }
    expect(
      screen.getByText('Count complete · last update Oct 17, 11:40 pm'),
    ).toBeInTheDocument()
    expect(screen.getByText(/your closest compass match/)).toBeInTheDocument()
  })

  it('renders every riding section', () => {
    mount(bc())
    for (const name of [
      'Seats',
      'Your riding',
      'Every riding',
      'How the seat count moved',
      "What's left to count",
      'Popular-vote momentum',
      'Changing hands since last time',
      'Popular vote by region',
      'The legislature so far, on the compass',
    ]) {
      expect(
        screen.getByRole('heading', { name, level: 2 }),
        name,
      ).toBeInTheDocument()
    }
    expect(screen.getByText(/for a majority/)).toBeInTheDocument()
    expect(
      screen.getByRole('searchbox', { name: 'Find a riding or candidate' }),
    ).toBeInTheDocument()
  })

  it('renders every referendum section', () => {
    const ab = alberta()
    mount(ab)
    for (const g of ab.groups)
      expect(screen.getByRole('heading', { name: g.label })).toBeInTheDocument()
    for (const name of [
      'Polls reported over time',
      'Votes counted per question',
      'How each question moved',
      'Lately',
      'Calgary, Edmonton and the rest',
      'By electoral division',
    ]) {
      expect(
        screen.getByRole('heading', { name, level: 2 }),
        name,
      ).toBeInTheDocument()
    }
    expect(screen.getByText(/Your ballot:/)).toHaveTextContent('Remain')
  })
})
