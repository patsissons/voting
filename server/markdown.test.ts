import { describe, expect, it } from 'vitest'
import { feedText, fixtureFeeds } from '../scripts/fixtures/fixture.ts'
import {
  alberta,
  bc,
  bcEarlyVote,
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
    const withBefore = electionMarkdown(
      {
        ...e,
        chambers: [
          { ...e.chambers[0], before: { dem: 1, gop: 2 } },
          ...e.chambers.slice(1),
        ],
      },
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
    expect(withBefore).toContain(
      '- Dem: 3 (2 called, 1 leading, 0 not up; 1 before, net +1 counting seats called and not up)',
    )
    expect(withBefore).toContain(
      '- GOP: 1 (1 called, 0 leading, 0 not up; 2 before, net -1 counting seats called and not up)',
    )
    expect(withBefore).toContain('- Vacant before the election: 1')
    const waiting = electionMarkdown(e, null, origin)
    expect(waiting).toContain('No results yet')
    expect(waiting).toContain('[civicAPI](https://civicapi.org/)')
    expect(waiting).not.toContain('## Before the election')
    // Holders and ratings: the picture going in, and the seats changing hands once called.
    const rated = {
      ...e,
      chambers: [
        {
          ...e.chambers[0],
          before: { dem: 1, gop: 2, other: 1 },
          holders: {
            'ak-al': 'dem',
            'ca-12': 'dem',
            'ny-10': 'gop',
            'wi-02': null,
          },
          ratings: {
            label: 'Tiny Ball',
            url: 'https://example.com/ratings',
            asOf: '2026-10-27',
            divisions: {
              'ak-al': 'lean gop',
              'ca-12': 'safe dem',
              'ny-10': 'tossup',
              'wi-02': 'safe dem',
            },
          },
        },
        ...e.chambers.slice(1),
      ],
    }
    const goingIn = electionMarkdown(rated, null, origin)
    expect(goingIn).toContain(
      '## Before the election\n\n### House of Representatives before the election\n\n- Held: GOP 2, Dem 1, Others 1.\n- Seats up, by the party holding them: Dem 2, GOP 1, 1 with no sitting member (vacant or newly drawn).\n- Ratings by [Tiny Ball](https://example.com/ratings) as of 2026-10-27: Safe Dem 2, Toss-up 1, Lean GOP 1. A seat the forecaster does not list as competitive is safe for its holder.\n- Rated to change hands: Alaska at-large (Lean GOP, from Dem).\n- Toss-ups: New York 10 (GOP).',
    )
    expect(goingIn).not.toContain('### Senate before the election')
    const after = electionMarkdown(
      rated,
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
    expect(after).toContain(
      '- Dem: 3 (2 called, 1 leading, 0 not up; 1 before, net +1 counting seats called and not up; 1 gained from other parties, 1 lost)',
    )
    expect(after).toContain(
      '- Others: 0 (0 called, 0 leading, 0 not up; 1 before, net -1 counting seats called and not up; 0 gained from other parties, 0 lost)',
    )
    expect(after.indexOf('## Before the election')).toBeGreaterThan(
      after.indexOf('### Races by state'),
    )
  })

  it('adds the advance vote by riding to a district election, before and after the results', () => {
    const e = bc()
    const ev = bcEarlyVote()
    const waiting = electionMarkdown(e, null, origin, ev)
    expect(waiting).toContain('No results yet')
    expect(waiting).toContain('### Advance voting')
    expect(waiting).toContain(
      'Advance ballots cast Fri Oct 16 to Wed Oct 21 (as of Oct 22, 4:33 pm UTC from [Elections BC, advance voting turnout](https://elections.bc.ca/2026-provincial-election/)): 891,348, 23.8% of 3,738,182 registered voters, -11.0% from 2024 (1,001,331). Voters are counted in the riding where they voted, not where they live; the figures are preliminary.',
    )
    expect(waiting).toContain(
      'By day: Fri Oct 16 137,832 (2024 day 1: 171,381); Sat Oct 17 201,774 (2024 day 2: 155,464);',
    )
    expect(waiting).toContain(
      '| Riding | Advance ballots | Of registered | vs 2024 |',
    )
    expect(waiting).toContain(
      '| Ladysmith-Oceanside | 17,436 | 34.1% | +11.4% |',
    )
    expect(waiting).toContain('| Abbotsford West | 6,072 | 15.6% | -33.7% |')
    const section = waiting.slice(waiting.indexOf('### Advance voting'))
    expect(section.slice(0, section.indexOf('\n## '))).not.toMatch(/state/i)
    const after = electionMarkdown(e, latest(e), origin, ev)
    expect(after).not.toContain('No results yet')
    expect(after.indexOf('### Advance voting')).toBeGreaterThan(
      after.indexOf('### Seats'),
    )
    expect(after.indexOf('Also follow:')).toBeGreaterThan(
      after.indexOf('### Advance voting'),
    )
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
      'Ballots cast before voting day as of Oct 23, 7:25 pm UTC from [UF Election Lab, 2026 early voting](https://election.lab.ufl.edu/early-vote/2026-early-voting/): 6,071,374 (2,660,455 in person, 3,410,919 by mail).',
    )
    expect(waiting).toContain(
      'Party registration of early voters across the 3 states that register by party (74.3% of ballots cast): Dem 2,067,470 (45.9%), GOP 1,308,379 (29.1%), other 1,127,492 (25.0%); Dem +16.9 pts. By mail: Dem 1,554,742 (47.3%), GOP 1,021,711 (31.1%), other 711,856 (21.6%). In person: Dem 512,728 (42.2%), GOP 286,668 (23.6%), other 415,636 (34.2%), in the states that report the split.',
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
    const after = electionMarkdown(e, latest(e), origin, ev)
    expect(after).not.toContain('Early vote so far')
    expect(after.indexOf('### Early vote')).toBeGreaterThan(
      after.indexOf('### Races by state'),
    )
    expect(after).toContain(
      'This is who had voted, not how: no state releases vote counts before its polls close.',
    )
    expect(after).toContain('| Georgia | 1,497,446 | 37.8% |  |')
    expect(after.indexOf('Also follow:')).toBeGreaterThan(
      after.indexOf('### Early vote'),
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
