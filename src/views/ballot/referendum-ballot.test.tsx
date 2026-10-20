import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TipProvider } from '@/components/charts/tooltip'
import { feedText, fixtureFeeds } from '../../../scripts/fixtures/fixture.ts'
import { alberta } from '../../../scripts/fixtures/load.ts'
import { normalize } from '../../../shared/parsers/index.ts'
import { ReferendumBallot } from './referendum-ballot'

const ab = alberta()

describe('ReferendumBallot', () => {
  beforeEach(() => {
    localStorage.clear()
    window.location.hash = ''
  })

  it('marks a question, writes the hash and the summary', () => {
    const onChange = vi.fn()
    render(
      <TipProvider>
        <ReferendumBallot
          election={ab}
          hash=""
          latest={null}
          onChange={onChange}
        />
      </TipProvider>,
    )
    expect(screen.getAllByText('0 of 10 marked').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: /^Remain/ }))
    expect(window.location.hash).toBe('#/compass/0')
    expect(screen.getAllByText('1 of 10 marked').length).toBeGreaterThan(0)
    expect(
      screen.getByRole('heading', { name: 'Your ballot' }),
    ).toBeInTheDocument()
    expect(onChange).toHaveBeenLastCalledWith({ 0: 0 }, '#/compass/0')
    fireEvent.click(screen.getByRole('button', { name: 'Clear my mark' }))
    expect(screen.getAllByText('0 of 10 marked').length).toBeGreaterThan(0)
  })

  it('loads marks from a shared link and shows the running count', () => {
    const latest = normalize(feedText(fixtureFeeds(ab)[9]), ab)
    render(
      <TipProvider>
        <ReferendumBallot election={ab} hash="#/compass/0--1" latest={latest} />
      </TipProvider>,
    )
    expect(screen.getAllByText('2 of 10 marked').length).toBeGreaterThan(0)
    // One per card, plus the summary table's column.
    expect(screen.getAllByText('Count so far').length).toBe(
      ab.questions.length + 1,
    )
    expect(
      JSON.parse(localStorage.getItem('voting:alberta-2026:ballot') || '{}'),
    ).toEqual({ 0: 0, 3: 1 })
  })
})
