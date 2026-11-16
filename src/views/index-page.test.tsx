import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const rows = [
  {
    id: 'a',
    slug: 'bc-2026',
    title: 'BC Votes 2026',
    description: 'Fifteen questions.',
    voting_day: '2026-10-24 12:00:00.000Z',
    ballot: 'district',
    final_day: '2026-11-09 12:00:00.000Z',
    final_expected: false,
  },
  {
    id: 'c',
    slug: 'us-2026',
    title: 'US Midterms 2026',
    description: 'Live results.',
    voting_day: '2026-11-03 12:00:00.000Z',
    ballot: 'chambers',
    final_day: '2099-11-17 12:00:00.000Z',
    final_expected: true,
  },
  {
    id: 'b',
    slug: 'vancouver-2026',
    title: 'Vancouver Votes 2026',
    description: 'Thirteen questions.',
    voting_day: '2026-10-17 12:00:00.000Z',
    ballot: 'at-large',
    final_day: '',
  },
]
const getFullList = vi.fn()
vi.mock('@/lib/pocketbase', () => ({
  pb: { collection: () => ({ getFullList }) },
}))

import { IndexPage } from './index-page'

describe('IndexPage', () => {
  it('lists the published elections as cards', async () => {
    getFullList.mockResolvedValueOnce(rows)
    render(<IndexPage />)
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'BC Votes 2026' }),
      ).toBeInTheDocument(),
    )
    expect(
      screen.getByRole('link', { name: /Vancouver Votes 2026/ }),
    ).toHaveAttribute('href', '/vancouver-2026')
    expect(screen.getByText('Riding by riding')).toBeInTheDocument()
    expect(screen.getByText('Live results')).toBeInTheDocument()
    expect(screen.getByText('Saturday, October 24')).toBeInTheDocument()
    // The day results became final, or are expected to; none without one.
    expect(
      screen.getByText('Results final Monday, November 9'),
    ).toBeInTheDocument()
    expect(screen.getByText(/^Final results expected /)).toBeInTheDocument()
    expect(screen.getAllByText(/Results final|Final results/)).toHaveLength(2)
    // A known final day that has passed turns the card's badge Final.
    const bc = screen.getByRole('link', { name: /BC Votes 2026/ })
    expect(bc).toHaveTextContent('Final')
  })

  it('says when nothing could be loaded', async () => {
    getFullList.mockRejectedValueOnce(new Error('down'))
    render(<IndexPage />)
    await waitFor(() =>
      expect(screen.getByText(/could not be loaded/)).toBeInTheDocument(),
    )
  })
})
