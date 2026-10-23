import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TipProvider } from '@/components/charts/tooltip'
import { feedText, fixtureFeeds } from '../../../scripts/fixtures/fixture.ts'
import { alberta, bc, us, vancouver } from '../../../scripts/fixtures/load.ts'
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
      'Map',
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
      'Map',
      'By electoral division',
    ]) {
      expect(
        screen.getByRole('heading', { name, level: 2 }),
        name,
      ).toBeInTheDocument()
    }
    expect(screen.getByText(/Your ballot:/)).toHaveTextContent('Remain')
  })

  it('blends every riding on the BC map', async () => {
    mount(bc())
    const map = await screen.findByRole('img', {
      name: "Each riding's blend of party colours by vote share",
    })
    const paths = [...map.querySelectorAll('path[data-code]')]
    expect(paths).toHaveLength(93)
    const fills = paths.map((p) => p.getAttribute('fill') || '')
    expect(fills.every((f) => f.includes('var(--party-'))).toBe(true)
    expect(fills.some((f) => f.startsWith('color-mix(in oklab'))).toBe(true)
  })

  it('waits without a compass link for a results-only election', () => {
    mount(us(), [])
    expect(
      screen.getByRole('heading', { name: 'No results yet' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'the ballot compass' }),
    ).toBeNull()
    expect(screen.getByText(/as civicAPI reports them/)).toBeInTheDocument()
  })

  it('renders every chamber with its balance, races and the state picker', async () => {
    mount(us())
    for (const name of [
      'Your state',
      'House of Representatives',
      'Senate',
      'Governors',
    ])
      expect(screen.getByRole('heading', { name })).toBeInTheDocument()
    expect(
      screen.getAllByRole('heading', { name: 'Balance of power' }),
    ).toHaveLength(3)
    expect(screen.getAllByRole('heading', { name: 'Every race' })).toHaveLength(
      3,
    )
    const house = document.getElementById('house-balance')!
    const bar = within(house).getByRole('img', { name: /218 for a majority/ })
    expect(bar.getAttribute('aria-label')).toMatch(/Dem \d+ \(\d+ called/)
    expect(within(house).getByText(/for a majority/)).toBeInTheDocument()
    expect(screen.getByText('Races called')).toBeInTheDocument()
    expect(
      screen.getByRole('combobox', { name: 'Your state' }),
    ).toHaveTextContent('Choose a state')
    const [map] = await screen.findAllByRole('img', {
      name: /^House of Representatives: each district coloured/,
    })
    const fills = [...map.querySelectorAll('path[data-code]')].map(
      (p) => p.getAttribute('fill') || '',
    )
    expect(fills).toHaveLength(435)
    expect(fills.some((f) => f.startsWith('color-mix(in oklab'))).toBe(true)
    expect(fills.some((f) => /^var\(--party-(dem|gop)/.test(f))).toBe(true)
    const [states] = await screen.findAllByRole('img', {
      name: /^Senate: each state coloured/,
    })
    expect(states.querySelectorAll('path[data-code]')).toHaveLength(50)
  })

  it('shows the chosen state’s races first', () => {
    localStorage.setItem('voting:us-2026:district', 'ak')
    mount(us())
    expect(
      screen.getByRole('heading', { name: 'Your state: Alaska' }),
    ).toBeInTheDocument()
    const mine = document.getElementById('mine')!
    expect(
      within(mine).getByRole('heading', {
        name: 'House of Representatives: Alaska at-large',
      }),
    ).toBeInTheDocument()
    expect(
      within(mine).getByRole('heading', { name: 'Senate' }),
    ).toBeInTheDocument()
    expect(
      within(mine).getByRole('heading', { name: 'Governors' }),
    ).toBeInTheDocument()
    const races = document.getElementById('senate-races')!
    const groups = () =>
      [...races.querySelectorAll('details.rounded-lg')].map((d) => ({
        state: d.querySelector('summary span')!.textContent!,
        open: d.hasAttribute('open'),
      }))
    expect(groups().find((g) => g.state.startsWith('Alaska'))!.open).toBe(true)
    expect(groups().find((g) => g.state.startsWith('Georgia'))!.open).toBe(
      false,
    )
    fireEvent.change(within(races).getByRole('searchbox'), {
      target: { value: 'georgia' },
    })
    expect(groups().map((g) => g.state)).toEqual(['Georgia'])
  })

  it('maps the first question with division rows on the Alberta map', async () => {
    mount(alberta())
    const section = document.getElementById('map')!
    const [map] = await within(section).findAllByRole('img', {
      name: /^Question 10, Separation: each division's blend/,
    })
    const fills = [...map.querySelectorAll('path[data-code]')].map((p) =>
      p.getAttribute('fill'),
    )
    expect(fills).toHaveLength(87)
    expect(fills.some((f) => f!.includes('var(--ref-a)'))).toBe(true)
    expect(
      within(section).getByRole('combobox', { name: 'Map question' }),
    ).toHaveTextContent('Q10 Separation')
  })
})
