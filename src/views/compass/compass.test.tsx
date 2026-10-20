import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TipProvider } from '@/components/charts/tooltip'
import { bc, vancouver } from '../../../scripts/fixtures/load.ts'
import type { CompassElection } from '../../../shared/schema/election.ts'
import { Compass } from './compass'

const election = vancouver()
const bcDoc = bc()

function mount(hash = '', e: CompassElection = election) {
  window.location.hash = hash
  const onChange = vi.fn()
  render(
    <TipProvider>
      <Compass election={e} hash={hash} onChange={onChange} />
    </TipProvider>,
  )
  return onChange
}

describe('Compass', () => {
  beforeEach(() => {
    localStorage.clear()
    window.location.hash = ''
  })

  it('starts on the intro and walks into the first question', () => {
    const onChange = mount()
    expect(screen.getByText(election.lede)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Start the compass/ }))
    expect(screen.getByText('Question 1 of 13')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: election.questions[0].q }),
    ).toBeInTheDocument()
    expect(window.location.hash).toBe('#/compass/-/q0')
    const next = screen.getAllByRole('button', { name: /Next/ })[0]
    expect(next).toBeDisabled()
    fireEvent.click(
      screen.getByRole('button', {
        name: new RegExp(election.questions[0].opts[1].t.slice(0, 20)),
      }),
    )
    expect(next).toBeEnabled()
    fireEvent.click(next)
    expect(screen.getByText('Question 2 of 13')).toBeInTheDocument()
    expect(window.location.hash).toBe('#/compass/1/q1')
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ i: 1 }),
      '#/compass/1/q1',
    )
    expect(
      JSON.parse(localStorage.getItem('voting:vancouver-2026:compass') || '{}'),
    ).toMatchObject({ i: 1, answers: { 0: 1 } })
  })

  it('renders the results a shared cubby.fyi link describes', () => {
    mount('#/compass/2--A--------1')
    expect(
      screen.getByRole('heading', { name: /Closest to/ }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Your results · 3 of 13 questions scored'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'A ballot to start from' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Share results/ }),
    ).toBeInTheDocument()
    // The link beats whatever this browser had saved, and becomes its state.
    expect(
      JSON.parse(localStorage.getItem('voting:vancouver-2026:compass') || '{}'),
    ).toMatchObject({
      done: true,
      answers: { 0: 2, 3: 0, 12: 1 },
      weights: { 3: true },
    })
  })

  it('swaps a name out of the ballot card and back in', () => {
    mount('#/compass/0000000000000')
    const out = screen.getAllByRole('button', { name: /^Swap out / })[0]
    const name = out.getAttribute('aria-label')!.replace('Swap out ', '')
    fireEvent.click(out)
    expect(
      screen.getByRole('button', { name: `Swap ${name} back in` }),
    ).toBeInTheDocument()
    expect(
      JSON.parse(localStorage.getItem('voting:vancouver-2026:omit') || '[]')
        .length,
    ).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: /Undo swaps/ }))
    expect(
      screen.queryByRole('button', { name: `Swap ${name} back in` }),
    ).toBeNull()
  })

  it('shows the riding picker for a district election', () => {
    mount('#/compass/000000000000000', bcDoc)
    expect(
      screen.getByRole('heading', { name: 'Your riding' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('combobox', { name: 'Your riding' }),
    ).toHaveTextContent('Choose a riding')
    expect(
      screen.getByRole('heading', { name: 'Your top matches' }),
    ).toBeInTheDocument()
  })
})
