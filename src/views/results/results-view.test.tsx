import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TipProvider } from '@/components/charts/tooltip'
import { feedText, fixtureFeeds } from '../../../scripts/fixtures/fixture.ts'
import {
  alberta,
  bc,
  bcEarlyVote,
  fixture,
  us,
  vancouver,
} from '../../../scripts/fixtures/load.ts'
import type { EarlyVote } from '../../../shared/early-vote.ts'
import { parseEarlyVote } from '../../../shared/parsers/early-vote.ts'
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
  earlyVote: EarlyVote | null = null,
) {
  render(
    <TipProvider>
      <ResultsView
        election={e}
        snapshots={snapshots}
        earlyVote={earlyVote}
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
      'Ballot boxes reported over time',
      'Popular-vote momentum',
      'Where the new votes went',
      'Popular vote over time',
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
    expect(screen.getByText('Out-of-district counts done')).toBeInTheDocument()
    expect(screen.queryByText(/rejected/)).toBeNull()
  })

  it('drops the out-of-district meter and shows rejected ballots on a 2026 page', () => {
    const e = bc()
    const snapshots = night(e).map((s) => ({
      ...s,
      payload: {
        ...s.payload,
        contests: s.payload.contests.map((c) => ({
          ...c,
          rejected: c.id === 'ABM' ? 7 : 1,
          boxes: c.boxes && { ...c.boxes, ood: '' },
        })),
      },
    }))
    mount(e, snapshots)
    expect(screen.queryByText('Out-of-district counts done')).toBeNull()
    expect(
      screen.getByText(/^plus 99 rejected · [\d.]+% rejection rate$/),
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

  it('shows the early vote while waiting, until the first contests', async () => {
    const ev = parseEarlyVote(
      fixture('voting-2026-early-vote.csv'),
      us().regions,
      '2026-10-23T19:25:09Z',
    )
    localStorage.setItem('voting:us-2026:district', 'ga')
    const [first] = night(us())
    const empty = { ...first, payload: { ...first.payload, contests: [] } }
    mount(us(), [empty], null, ev)
    expect(
      screen.getByRole('heading', {
        name: 'Ballots cast as of Fri, Oct 23, 3:25 pm EDT',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText(/Early voting is under way/)).toBeInTheDocument()
    expect(screen.getByText('6,071,374')).toBeInTheDocument()
    const [map] = await screen.findAllByRole('img', {
      name: /^Ballots cast by state as a share of the 2022 midterm: /,
    })
    expect(map.getAttribute('aria-label')).toMatch(/Georgia 38%/)
    const fills = [...map.querySelectorAll('path[data-code]')].map(
      (p) => p.getAttribute('fill') || '',
    )
    expect(
      fills.filter((f) => f.startsWith('color-mix(in oklab, var(--brand)')),
    ).toHaveLength(5)
    expect(map.querySelector('path[data-ring="ga"]')).not.toBeNull()
    const states = document.getElementById('early-vote-party-states')!
    expect(
      within(states)
        .getAllByRole('img')
        .map((b) => b.getAttribute('aria-label')),
    ).toEqual([
      'California: Dem 50.0%, GOP 29.1%, Unaffiliated or other 20.9%',
      'North Carolina: Dem 42.2%, GOP 23.3%, Unaffiliated or other 34.4%',
      'Arizona: Dem 38.7%, GOP 38.5%, Unaffiliated or other 22.8%',
    ])
    expect(
      screen.getByText('This is who has voted, not how they voted.'),
    ).toBeInTheDocument()
    // The totals over the three states that register by party, with the
    // mail and in-person rows where they report those.
    const party = document.getElementById('early-vote-party')!
    expect(party).toHaveTextContent('3 states that register voters by party')
    for (const [label, value, share] of [
      ['Dem', '2,067,470', '45.9%'],
      ['GOP', '1,308,379', '29.1%'],
      ['Unaffiliated or other', '1,127,492', '25.0%'],
    ])
      expect(
        within(party).getByText(label, { selector: 'span.uppercase' })
          .parentElement,
      ).toHaveTextContent(`${label}${value}${share}`)
    expect(party).toHaveTextContent(
      'Dem +16.9 pts among early voters in the 3 states that register by party, 74% of all ballots cast.',
    )
    expect(
      within(document.getElementById('early-vote-party-total')!)
        .getAllByRole('img')
        .map((b) => b.getAttribute('aria-label')),
    ).toEqual([
      'Reporting states: Dem 45.9%, GOP 29.1%, Unaffiliated or other 25.0%',
      'By mail: Dem 47.3%, GOP 31.1%, Unaffiliated or other 21.6%',
      'In person: Dem 42.2%, GOP 23.6%, Unaffiliated or other 34.2%',
    ])
    expect(party).toHaveTextContent('(3 by mail, 1 in person)')
    // The margin map: a diverging scale, grey within five points, hatched
    // where a state does not register by party.
    const [lean] = await screen.findAllByRole('img', {
      name: /^Party registration of early voters by state: /,
    })
    expect(lean.getAttribute('aria-label')).toBe(
      'Party registration of early voters by state: California Dem +20.9, North Carolina Dem +18.9, Arizona Dem +0.2',
    )
    const fillOf = (code: string) =>
      lean.querySelector(`path[data-code="${code}"]`)!.getAttribute('fill')
    expect(fillOf('ca')).toBe(
      'color-mix(in oklab, var(--party-dem, var(--party-other)) 70%, var(--muted))',
    )
    expect(fillOf('nc')).toBe(fillOf('ca'))
    expect(fillOf('az')).toBe(
      'color-mix(in oklab, var(--muted-foreground) 45%, var(--muted))',
    )
    expect(fillOf('ga')).toMatch(/^url\(#.*-hatch\)$/)
    expect(lean.querySelector('path[data-code="ak"]')).toHaveAttribute(
      'data-hatched',
    )
    expect(fillOf('tx')).toBe('var(--muted)')
    expect(lean.querySelector('path[data-ring="ga"]')).not.toBeNull()
    fireEvent.focus(lean.querySelector('path[data-code="nc"]')!)
    expect(screen.getByRole('status')).toHaveTextContent(
      'North CarolinaDem535,973 (42.2%)GOP296,478 (23.3%)Unaffiliated or other437,469 (34.4%)MarginDem +18.9 ptsBy mailDem 42% · GOP 18% · Other 40%In personDem 42% · GOP 24% · Other 34%UpdatedFri Oct 23',
    )
    fireEvent.focus(lean.querySelector('path[data-code="ga"]')!)
    expect(screen.getByRole('status')).toHaveTextContent(
      'Does not register voters by party',
    )
  })

  it('folds the early vote under the results once contests arrive', () => {
    const ev = parseEarlyVote(
      fixture('voting-2026-early-vote.csv'),
      us().regions,
      '2026-10-23T19:25:09Z',
    )
    mount(us(), undefined, null, ev)
    expect(screen.queryByText(/Early voting is under way/)).toBeNull()
    const folded = document.getElementById('early-vote') as HTMLDetailsElement
    expect(folded.open).toBe(false)
    expect(
      within(folded).getByRole('heading', { name: /^Ballots cast as of/ }),
    ).toBeInTheDocument()
    expect(within(folded).getByText('6,071,374')).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'Results sections' })
    fireEvent.click(within(nav).getByRole('link', { name: 'Early vote' }))
    expect(folded.open).toBe(true)
  })

  it('keeps every region folded and draws momentum as change bars', () => {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get: () => 640,
    })
    localStorage.setItem('voting:bc-2026:district', 'ABM')
    mount(bc())
    expect(
      screen.getByRole('heading', { name: 'Your riding: Abbotsford-Mission' }),
    ).toBeInTheDocument()
    const regions = [
      ...document.querySelectorAll('#ridings details.rounded-lg'),
    ] as HTMLDetailsElement[]
    expect(regions.length).toBeGreaterThan(1)
    expect(regions.every((d) => !d.open)).toBe(true)
    expect(
      screen.getByRole('img', {
        name: /^Popular-vote momentum: each share of the votes counted since/,
      }),
    ).toBeInTheDocument()
  })

  it('shows the advance vote by riding while BC waits', async () => {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get: () => 640,
    })
    localStorage.setItem('voting:bc-2026:district', 'LAO')
    mount(bc(), [], null, bcEarlyVote())
    expect(
      screen.getByText(
        /Advance voting ran Fri Oct 16 to Wed Oct 21: 891,348 ballots cast, 23\.8% of registered voters\./,
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', {
        name: 'Advance voting, Fri Oct 16 to Wed Oct 21',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Figures as of Thu, Oct 22, 9:33 am PDT/),
    ).toBeInTheDocument()
    expect(screen.getByText('891,348')).toBeInTheDocument()
    for (const [label, text] of [
      ['Of registered voters', '23.8%3,738,182 registered'],
      ['vs 2024', '-11.0%1,001,331 in 2024'],
    ])
      expect(
        screen.getByText(label, { selector: 'span.uppercase' }).parentElement,
      ).toHaveTextContent(text)
    const days = screen.getByRole('img', { name: /^Advance ballots by day: / })
    expect(days.getAttribute('aria-label')).toBe(
      'Advance ballots by day: Fri Oct 16 137,832 (2024: 171,381), Sat Oct 17 201,774 (2024: 155,464), Sun Oct 18 105,049 (2024: 150,250), Mon Oct 19 128,636 (2024: 119,660), Tue Oct 20 139,101 (2024: 181,669), Wed Oct 21 178,956 (2024: 222,907)',
    )
    const [map] = await screen.findAllByRole('img', {
      name: /^Advance ballots by riding as a share of 2024 advance voting: /,
    })
    expect(map.getAttribute('aria-label')).toMatch(/Ladysmith-Oceanside 111%/)
    expect(map.querySelector('path[data-ring="LAO"]')).not.toBeNull()
    expect(
      map.querySelectorAll(
        'path[data-code][fill^="color-mix(in oklab, var(--brand)"]',
      ).length,
    ).toBeGreaterThan(90)
    expect(document.getElementById('early-vote-party')).toBeNull()
    expect(document.getElementById('early-vote-lean')).toBeNull()
    expect(screen.queryByText(/state/i)).toBeNull()
    expect(
      screen.getByRole('link', { name: 'the daily table' }),
    ).toHaveAttribute(
      'href',
      'https://elections.bc.ca/2026election/2026-advance-voting-turnout.pdf',
    )
  })

  it('folds the advance vote under the BC results', () => {
    mount(bc(), undefined, null, bcEarlyVote())
    expect(screen.queryByText(/Advance voting ran/)).toBeNull()
    const folded = document.getElementById('early-vote') as HTMLDetailsElement
    expect(folded.open).toBe(false)
    expect(folded).toHaveTextContent(
      'Advance votingadvance ballots cast Fri Oct 16 to Wed Oct 21',
    )
    const nav = screen.getByRole('navigation', { name: 'Results sections' })
    fireEvent.click(within(nav).getByRole('link', { name: 'Advance voting' }))
    expect(folded.open).toBe(true)
    expect(within(folded).getByText('891,348')).toBeInTheDocument()
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
    // The document's `before`: the seats held going in and each party's net change.
    expect(
      within(house).getByText(
        /^Before the election: GOP 218 · Dem 214 · 3 vacant\. The change in brackets counts seats called and not up, not leads\.$/,
      ),
    ).toBeInTheDocument()
    expect(
      within(house).getByText(/^(Dem|GOP) \d+ \([+−]\d+\) · /),
    ).toBeInTheDocument()
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
