// A split-flap clock: H:MM:SS of seconds(), re-read every second. Only the
// digits that change flip: the top flap folds down, the bottom one drops in.
// Reduced motion swaps the digits in place (index.css). A fresh clock rolls
// every digit in from zero, so a new count reads as one.
import { useEffect, useRef, useState } from 'react'

export type FlipClockProps = {
  seconds: () => number
  format: (s: number) => string
  spoken: (s: number) => string
}

type Cell = { ch: string; prev: string | null; flipKey: number }

export function FlipClock({ seconds, format, spoken }: FlipClockProps) {
  const [text, setText] = useState(() => format(Math.max(0, seconds())))
  void text
  const [cells, setCells] = useState<Cell[]>(() =>
    [...text].map((ch) => ({
      ch: ch === ':' ? ch : '0',
      prev: null,
      flipKey: 0,
    })),
  )
  const [said, setSaid] = useState(() => spoken(Math.max(0, seconds())))
  const minute = useRef(-1)

  useEffect(() => {
    // Every second: the new text, the flips it needs, and once a minute the
    // spoken form for screen readers.
    const tick = () => {
      const s = Math.max(0, seconds())
      const next = format(s)
      setText(next)
      setCells((prev) => {
        if (
          prev.length !== next.length ||
          prev.some((c, i) => (c.ch === ':') !== (next[i] === ':'))
        ) {
          return [...next].map((ch) => ({ ch, prev: null, flipKey: 0 }))
        }
        return prev.map((c, i) =>
          c.ch === next[i]
            ? c
            : { ch: next[i], prev: c.ch, flipKey: c.flipKey + 1 },
        )
      })
      const m = Math.floor(s / 60)
      if (m !== minute.current) {
        minute.current = m
        setSaid(spoken(s))
      }
    }
    const timer = setInterval(tick, 1000)
    const first = setTimeout(tick, 0)
    return () => {
      clearInterval(timer)
      clearTimeout(first)
    }
  }, [seconds, format, spoken])

  return (
    <span className="flip" role="timer" aria-live="off">
      <span className="flip-faces inline-flex gap-[2px]" aria-hidden="true">
        {cells.map((c, i) =>
          c.ch === ':' ? (
            <span key={i} className="flip-colon">
              :
            </span>
          ) : (
            <span key={i} className="flip-card">
              <span className="fc-top">
                <b>{c.ch}</b>
              </span>
              <span className="fc-bot">
                <b>{c.ch}</b>
              </span>
              {c.prev != null ? (
                <FlapPair key={c.flipKey} from={c.prev} to={c.ch} />
              ) : null}
            </span>
          ),
        )}
      </span>
      <span className="sr-only">{said}</span>
    </span>
  )
}

/** The two animated flaps for one change, over a cover that keeps the old digit on the bottom face until the up flap lands. */
function FlapPair({ from, to }: { from: string; to: string }) {
  const [done, setDone] = useState(false)
  if (done) return null
  return (
    <>
      <span className="fc-bot fc-old">
        <b>{from}</b>
      </span>
      <span className="fc-flap fc-down">
        <b>{from}</b>
      </span>
      <span className="fc-flap fc-up" onAnimationEnd={() => setDone(true)}>
        <b>{to}</b>
      </span>
    </>
  )
}
