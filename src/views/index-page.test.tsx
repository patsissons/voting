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
  },
  {
    id: 'c',
    slug: 'us-2026',
    title: 'US Midterms 2026',
    description: 'Live results.',
    voting_day: '2026-11-03 12:00:00.000Z',
    ballot: 'chambers',
  },
  {
    id: 'b',
    slug: 'vancouver-2026',
    title: 'Vancouver Votes 2026',
    description: 'Thirteen questions.',
    voting_day: '2026-10-17 12:00:00.000Z',
    ballot: 'at-large',
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
  })

  it('says when nothing could be loaded', async () => {
    getFullList.mockRejectedValueOnce(new Error('down'))
    render(<IndexPage />)
    await waitFor(() =>
      expect(screen.getByText(/could not be loaded/)).toBeInTheDocument(),
    )
  })
})
