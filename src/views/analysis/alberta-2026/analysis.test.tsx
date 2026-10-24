import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TipProvider } from '@/components/charts/tooltip'
import { feedText, fixtureFeeds } from '../../../../scripts/fixtures/fixture.ts'
import { alberta, bc } from '../../../../scripts/fixtures/load.ts'
import { normalize } from '../../../../shared/parsers/index.ts'
import type { Election } from '../../../../shared/schema/election.ts'
import { AnalysisView, hasAnalysis } from '..'
import AlbertaAnalysis from './analysis'

const night = (e: Election) =>
  fixtureFeeds(e).map((f, i) => ({
    id: `r${i}`,
    source_ts: '',
    official: false,
    polls_closed: 0,
    polls_total: 0,
    payload: normalize(feedText(f), e),
  }))

describe('alberta analysis', () => {
  it('lays out every section over the fixture night', () => {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get: () => 640,
    })
    const e = alberta()
    render(
      <TipProvider>
        <AlbertaAnalysis election={e} snapshots={night(e)} live={false} />
      </TipProvider>,
    )
    for (const name of [
      'Key findings',
      'Results against the polls',
      'One axis explains every answer',
      'By region',
      'Early leads that flipped',
      "How far each question's count got",
      'Every division',
    ])
      expect(
        screen.getByRole('heading', { name, level: 2 }),
      ).toBeInTheDocument()
    expect(
      screen.getByRole('navigation', { name: 'Analysis sections' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('img', { name: /^Question 1 against Question 10/ }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('row').length).toBeGreaterThan(87)
  })

  it('waits for division rows', () => {
    const e = alberta()
    render(<AlbertaAnalysis election={e} snapshots={[]} live={false} />)
    expect(
      screen.getByText(/arrives with the first results/),
    ).toBeInTheDocument()
  })

  it('is registered for Alberta only', () => {
    expect(hasAnalysis('alberta-2026')).toBe(true)
    expect(hasAnalysis('bc-2026')).toBe(false)
    expect(hasAnalysis('toString')).toBe(false)
    const { container } = render(
      <AnalysisView election={bc()} snapshots={[]} live={false} />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
