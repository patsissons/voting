import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { HomePage } from './HomePage'

vi.mock('@/lib/pocketbase', () => ({
  pb: {
    collection: () => ({
      getFullList: () =>
        Promise.resolve([
          {
            id: 'r1',
            title: 'Hello from PocketBase',
            body: 'Test post',
            created: '2024-01-01 00:00:00Z',
            updated: '2024-01-01 00:00:00Z',
          },
        ]),
    }),
  },
}))

describe('HomePage', () => {
  it('renders the app name and posts from PocketBase', async () => {
    render(<HomePage />)
    expect(screen.getByRole('heading', { name: 'voting' })).toBeInTheDocument()
    expect(await screen.findByText('Hello from PocketBase')).toBeInTheDocument()
  })
})
