import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Payload } from '../../../shared/payload.ts'
import { StatusLine } from './results-header'

const latest: Payload = {
  asOf: '2026-10-22 07:58:44',
  project: 'Alberta Votes 2026',
  official: false,
  ballots: 0,
  eligible: 0,
  turnout: null,
  polls: { closed: 5443, total: 5575 },
  tabulators: { closed: 0, total: 0 },
  groups: [],
  contests: [],
}

const mount = (live: boolean, done: boolean) =>
  render(
    <StatusLine
      latest={latest}
      live={live}
      done={done}
      doneText="Every question fully reported"
      owner="the"
      timeZone="America/Edmonton"
    />,
  )

describe('StatusLine', () => {
  it('says live while the stream is open and the count runs', () => {
    mount(true, false)
    expect(screen.getByText('Live')).toBeInTheDocument()
  })

  it('drops live once the count is done', () => {
    mount(true, true)
    expect(screen.queryByText('Live')).not.toBeInTheDocument()
    expect(
      screen.getByText(/Every question fully reported · last update/),
    ).toBeInTheDocument()
  })

  it('never says live without the stream', () => {
    mount(false, false)
    expect(screen.queryByText('Live')).not.toBeInTheDocument()
  })
})
