import { describe, expect, it } from 'vitest'
import { feedText, fixtureFeeds } from '../scripts/fixtures/fixture.ts'
import {
  alberta,
  bc,
  civicCounted,
  fixture,
  tinyChambers,
  us,
  vancouver,
} from '../scripts/fixtures/load.ts'
import { parseEarlyVote } from '../shared/parsers/early-vote.ts'
import { normalize } from '../shared/parsers/index.ts'
import type { Election } from '../shared/schema/election.ts'
import { electionMarkdown, llmsText } from './markdown.ts'

const origin = 'https://voting.lgtm.page'
const latest = (e: Election) => {
  const feeds = fixtureFeeds(e)
  const payload = normalize(feedText(feeds[feeds.length - 1]), e)
  return {
    id: 'r1',
    source_ts: payload.asOf,
    official: false,
    polls_closed: payload.polls.closed,
    polls_total: payload.polls.total,
    payload,
  }
}

describe('electionMarkdown', () => {
  it('writes the at-large page with dates, results and the compass', () => {
    const e = vancouver()
    const md = electionMarkdown(e, latest(e), origin)
    expect(md).toMatch(/^# Vancouver Votes 2026\n/)
    expect(md).toContain('- Page: https://voting.lgtm.page/vancouver-2026')
    expect(md).toContain('## When to vote')
    expect(md).toContain(
      '- Advance voting days: 2026-10-03, 2026-10-07, 2026-10-10, 2026-10-13',
    )
    expect(md).toContain(
      '## Results (unofficial, as of 2026-10-17 23:40:00 Pacific time)',
    )
    expect(md).toContain(
      '147 of 147 voting places reported; 175,000 ballots counted; turnout 37.0%.',
    )
    expect(md).toMatch(/Seats across City Hall \(elected, 27 in all\)/)
    expect(md).toContain('### Mayor (vote for 1)')
    expect(md).toContain('### Council (top 10 elected)')
    expect(md).toContain('- *seat line*')
    expect(md).toContain('## Parties and slates')
    expect(md).toContain('- Mayor: 54 Ken Sim (sitting)')
    expect(md).toContain('## Compass questions')
    expect(md).toContain(`${origin}/vancouver-2026#/compass/<code>`)
    expect(md.endsWith('\n')).toBe(true)
  })

  it('writes the riding page with seats, changing hands and every riding', () => {
    const e = bc()
    const md = electionMarkdown(e, latest(e), origin)
    expect(md).toContain('### Seats (47 of 93 for a majority)')
    expect(md).toMatch(/- BC NDP: leading \d+, [\d,]+ votes \(\d+\.\d%\)/)
    expect(md).toContain('### Lower Mainland')
    expect(md).toMatch(
      /- Abbotsford-Mission: .* \(Conservative\) [\d,]+ \(\d+\.\d%\), .* boxes/,
    )
    expect(md).toContain('## Ridings')
    expect(md).toContain(
      '- ABM Abbotsford-Mission: Pam Alexis (NDP); Darryl Kropp (Conservative)',
    )
    expect(md).toContain('- Leader: David Eby')
  })

  it('writes the referendum page with every question and its count', () => {
    const e = alberta()
    const md = electionMarkdown(e, latest(e), origin)
    expect(md).toContain(
      '## Results (unofficial, as of 2026-10-19 23:20:00 Mountain time)',
    )
    expect(md).toContain('### Question 10: Separation')
    expect(md).toMatch(
      /Remain [\d,]+ \(\d+\.\d%\) · Begin process [\d,]+ \(\d+\.\d%\); [\d,]+ of [\d,]+ polls reported \(whole ballot\)/,
    )
    expect(md).toContain('#### Question 1: Immigration control')
    expect(md).toContain('- Option 1: Yes')
    expect(md).toContain(
      'Polls: The Writ average (2026-10-18): Remain 69%, Begin process 26%.',
    )
    expect(md).toContain(`${origin}/alberta-2026#/compass/<code>`)
  })

  it('writes the chambers page with every balance and race, and no compass', () => {
    const e = tinyChambers()
    const payload = normalize(civicCounted(), e)
    const md = electionMarkdown(
      e,
      {
        id: 'r1',
        source_ts: payload.asOf,
        official: false,
        polls_closed: payload.polls.closed,
        polls_total: payload.polls.total,
        payload,
      },
      origin,
    )
    expect(md).toMatch(/^# Tiny Midterms 2026\n/)
    expect(md).toContain(
      '## Results (unofficial, as of 2026-11-03 22:30:00 Eastern time)',
    )
    expect(md).toContain(
      '5 of 8 races called; 606,000 votes counted in House races',
    )
    expect(md).toContain('### House of Representatives (3 of 4 for a majority)')
    expect(md).toContain('- Dem: 3 (2 called, 1 leading, 0 not up)')
    expect(md).toContain('### Senate (3 of 4 for a majority)')
    expect(md).toContain('- GOP: 2 (0 called, 1 leading, 1 not up)')
    expect(md).toContain('### Governors (3)')
    expect(md).toContain('#### Alaska')
    expect(md).toMatch(
      /- Alaska at-large \(House\): Nick Begich III \(GOP\) 58\.3%, Eric Hafner \(Dem\) 38\.8%, James C\. “Jim” McDermott \(Libertarian\) 2\.4%; 99\.0% of the expected vote in; called for Nick Begich III\./,
    )
    expect(md).toContain('- California (Gov): Xavier Becerra (Dem) 57.1%')
    expect(md).toContain('## What is being decided')
    expect(md).toContain(
      '- Senate: 2 of 4 seats up, 3 for a majority (not up: Dem 1, GOP 1).',
    )
    expect(md).not.toMatch(/compass/i)
    const waiting = electionMarkdown(e, null, origin)
    expect(waiting).toContain('No results yet')
    expect(waiting).toContain('[civicAPI](https://civicapi.org/)')
  })

  it('adds the early vote while no race has reported, and drops it after', () => {
    const e = us()
    const ev = parseEarlyVote(
      fixture('voting-2026-early-vote.csv'),
      e.regions,
      '2026-10-23T19:25:09.000Z',
    )
    const waiting = electionMarkdown(e, null, origin, ev)
    expect(waiting).toContain('No results yet')
    expect(waiting).toContain('### Early vote so far')
    expect(waiting).toContain(
      'Ballots cast as of Oct 23, 7:25 pm UTC from [UF Election Lab, 2026 early voting](https://election.lab.ufl.edu/early-vote/2026-early-voting/): 6,071,374 (2,660,455 in person, 3,410,919 by mail).',
    )
    expect(waiting).toContain(
      '| State | Ballots cast | Share of 2022 turnout | Registration (Dem / GOP / other) |',
    )
    expect(waiting).toContain(
      '| California | 2,478,771 | 22.2% | 50.0% / 29.1% / 20.9% |',
    )
    expect(waiting).toContain('| Georgia | 1,497,446 | 37.8% |  |')
    const empty = latest(e)
    const noContests = {
      ...empty,
      payload: { ...empty.payload, contests: [] },
    }
    expect(electionMarkdown(e, noContests, origin, ev)).toContain(
      '### Early vote so far',
    )
    expect(electionMarkdown(e, latest(e), origin, ev)).not.toContain(
      'Early vote',
    )
  })

  it('says when there are no results', () => {
    expect(electionMarkdown(vancouver(), null, origin)).toContain(
      "No results yet. They appear after polls close on voting day, from [the City's results page](https://results.vancouver.ca/).",
    )
    expect(electionMarkdown(alberta(), null, origin)).toContain(
      'Question 10 first',
    )
  })
})

describe('llmsText', () => {
  it('lists the elections with their status and the tools', () => {
    const e = vancouver()
    const text = llmsText(
      [
        { election: e, latest: latest(e).payload },
        { election: alberta(), latest: null },
      ],
      origin,
    )
    expect(text).toMatch(/^# Voting\n/)
    expect(text).toContain(
      '- [Vancouver Votes 2026](https://voting.lgtm.page/vancouver-2026.md) (at-large, voting day 2026-10-17, count complete)',
    )
    expect(text).toContain(
      '- [Alberta Votes 2026](https://voting.lgtm.page/alberta-2026.md) (referendum, voting day 2026-10-19, no results yet)',
    )
    expect(text).toContain('https://voting.lgtm.page/mcp')
    expect(text).toContain('list_elections, get_election')
  })
})
