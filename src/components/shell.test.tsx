import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { Shell } from './shell'

describe('Shell', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark')
  })

  it('renders the wordmark around its content', () => {
    render(
      <Shell>
        <p>hello</p>
      </Shell>,
    )
    expect(screen.getByRole('link', { name: 'Voting' })).toHaveAttribute(
      'href',
      '/',
    )
    expect(screen.getByText('hello')).toBeInTheDocument()
  })

  it('toggles and remembers the theme', () => {
    render(
      <Shell>
        <p>again</p>
      </Shell>,
    )
    const toggle = screen.getByRole('button', { name: 'Switch to dark mode' })
    fireEvent.click(toggle)
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(localStorage.getItem('voting:theme')).toBe('dark')
    expect(
      screen.getByRole('button', { name: 'Switch to light mode' }),
    ).toBeInTheDocument()
  })
})
