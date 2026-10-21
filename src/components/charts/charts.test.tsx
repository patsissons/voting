import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Meter, SegmentBar, TwoOptionBar } from './bars'
import { Choropleth } from './choropleth'
import { Dumbbell } from './dumbbell'
import { FlipClock } from './flip-clock'
import { Legend } from './legend'
import { Lines } from './lines'
import { Plane } from './plane'
import { Strip } from './strip'
import { TipProvider } from './tooltip'

// jsdom gives every element a zero width; the charts measure themselves, so
// hand them one.
function withWidth(width: number) {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => width,
  })
}

describe('chart kit', () => {
  it('fills the map by division, rings yours and describes on focus', async () => {
    const { container } = render(
      <TipProvider>
        <Choropleth
          set="ab-2017"
          fills={{ '04': 'red' }}
          ring="04"
          describe={(code) => ({
            title: `division ${code}`,
            lines: [{ label: 'Votes', value: '12' }],
          })}
          ariaLabel="map"
        />
      </TipProvider>,
    )
    const province = await screen.findByRole('img', { name: 'map' })
    expect(province.querySelectorAll('path[data-code]')).toHaveLength(87)
    expect(
      screen.getByRole('img', { name: 'map: Calgary' }),
    ).toBeInTheDocument()
    const own = province.querySelector('path[data-code="04"]')!
    expect(own).toHaveAttribute('fill', 'red')
    expect(own).toHaveAttribute('tabindex', '0')
    expect(province.querySelector('path[data-code="05"]')).toHaveAttribute(
      'fill',
      'var(--muted)',
    )
    // The ring is drawn in the province and in the Calgary inset, whose
    // paths stay out of the tab order.
    expect(container.querySelectorAll('path[data-ring="04"]')).toHaveLength(2)
    expect(
      container.querySelector('[data-frame=calgary] path[data-code="04"]'),
    ).toHaveAttribute('tabindex', '-1')
    fireEvent.focus(own)
    expect(screen.getByRole('status')).toHaveTextContent('division 04')
    expect(screen.getByText(/Elections Alberta/)).toBeInTheDocument()
  })

  it('draws lines with a crosshair the keyboard can move', () => {
    withWidth(600)
    render(
      <TipProvider>
        <Lines
          points={[0, 50, 100]}
          lines={[
            { label: 'A', color: 'red', values: [10, 20, 30] },
            { label: 'B', color: 'blue', values: [null, 5, 15] },
          ]}
          xFormat={(v) => `${v}%`}
          yFormat={(v) => String(v)}
          title={(i) => `point ${i}`}
          ariaLabel="trend"
        />
      </TipProvider>,
    )
    const hit = screen
      .getAllByLabelText('trend')
      .find((el) => el.tagName === 'rect')!
    fireEvent.focus(hit)
    expect(screen.getByRole('status')).toHaveTextContent('point 2')
    fireEvent.keyDown(hit, { key: 'ArrowLeft' })
    expect(screen.getByRole('status')).toHaveTextContent('point 1')
    expect(screen.getByRole('status')).toHaveTextContent('A')
    expect(screen.getByRole('status')).toHaveTextContent('20')
  })

  it('places parties and the viewer on the plane', () => {
    withWidth(400)
    render(
      <TipProvider>
        <Plane
          points={[
            { key: 'a', label: 'A', color: 'red', x: -0.5, y: 0.5 },
            { key: 'b', label: 'B', color: 'blue', x: 0.6, y: -0.6 },
          ]}
          you={{ x: 0, y: 0 }}
          xLabels={['Left', 'Right']}
          yLabels={['Up', 'Down']}
          describe={(pt) => ({
            title: pt.label,
            lines: [{ label: 'x', value: String(pt.x) }],
          })}
          ariaLabel="plane"
        />
      </TipProvider>,
    )
    const svg = screen.getByRole('img', { name: 'plane' })
    expect(svg.querySelectorAll('circle.viz-dot').length).toBe(2)
    expect(svg.querySelector('.viz-you-ring')).not.toBeNull()
    fireEvent.focus(svg.querySelector('circle.viz-dot')!)
    expect(screen.getByRole('status')).toHaveTextContent('A')
  })

  it('renders strips, dumbbells, legends and bars', () => {
    withWidth(500)
    render(
      <TipProvider>
        <Strip
          rows={[
            {
              label: 'Row',
              color: 'red',
              dots: [
                {
                  value: 40,
                  in: true,
                  describe: () => ({ title: 'dot', lines: [] }),
                },
                {
                  value: 60,
                  in: false,
                  ring: true,
                  describe: () => ({ title: 'ring', lines: [] }),
                },
              ],
            },
          ]}
          xMax={100}
          xTicks={[0, 50, 100]}
          xFormat={(v) => `${v}%`}
          cutoff={50}
          cutoffLabel="half"
          marks={[{ value: 55, label: 'Province 55%', anchor: 'start' }]}
          ariaLabel="strip"
        />
        <Dumbbell
          rows={[
            {
              label: 'A',
              color: 'red',
              a: 40,
              b: 45,
              describe: () => ({ title: 'A', lines: [] }),
            },
          ]}
          aLabel="Overall"
          bLabel="Lately"
          xFormat={(v) => `${v}%`}
          ariaLabel="bell"
        />
        <Legend
          items={[
            { label: 'One', color: 'red' },
            { label: 'Two', color: 'blue', line: true },
          ]}
        />
        <Meter label="Boxes" closed={5} total={10} value="5 / 10" />
        <SegmentBar
          segments={[
            {
              key: 'a',
              label: 'A',
              color: 'red',
              n: 46,
              describe: () => ({ title: 'A', lines: [] }),
            },
          ]}
          total={93}
          majority={47}
          ariaLabel="seats"
        />
        <TwoOptionBar
          a="Yes"
          b="No"
          shares={[60, 40]}
          votes={[60, 40]}
          lead={0}
          started
        />
        <TwoOptionBar
          a="Yes"
          b="No"
          shares={[0, 0]}
          votes={[0, 0]}
          lead={-1}
          started={false}
        />
      </TipProvider>,
    )
    expect(
      screen
        .getByRole('img', { name: 'strip' })
        .querySelectorAll('.viz-strip-dot').length,
    ).toBe(2)
    expect(screen.getByRole('img', { name: 'bell' })).toBeInTheDocument()
    expect(screen.getByText('One')).toBeInTheDocument()
    expect(screen.getByText('5 / 10')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'seats' })).toHaveTextContent('46')
    expect(
      screen.getByRole('img', { name: 'Yes 60.0%, No 40.0%' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Count not started')).toBeInTheDocument()
  })

  it('ticks the flip clock', () => {
    render(
      <FlipClock
        seconds={() => 425}
        format={(s) =>
          `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
        }
        spoken={(s) => `${Math.floor(s / 60)} minutes ago`}
      />,
    )
    expect(screen.getByRole('timer')).toBeInTheDocument()
    expect(screen.getByText('7 minutes ago')).toBeInTheDocument()
  })

  it('keeps both halves of a flipped digit on the new value', () => {
    vi.useFakeTimers()
    let now = 425
    const { container } = render(
      <FlipClock
        seconds={() => now}
        format={(s) =>
          `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
        }
        spoken={(s) => `${Math.floor(s / 60)} minutes ago`}
      />,
    )
    act(() => vi.advanceTimersByTime(0))
    now = 426
    act(() => vi.advanceTimersByTime(1000))
    vi.useRealTimers()
    const last = [...container.querySelectorAll('.flip-card')].at(-1)!
    expect(last.querySelector('.fc-top')).toHaveTextContent('6')
    expect(last.querySelector('.fc-bot:not(.fc-old)')).toHaveTextContent('6')
    // The old digit covers the bottom only until the up flap lands.
    expect(last.querySelector('.fc-old')).toHaveTextContent('5')
  })
})
