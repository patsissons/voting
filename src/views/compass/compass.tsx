// The ballot compass: an intro, one question at a time (with "counts double"
// and review), and the results. Scoring and the hash grammar live in shared/.
import { ArrowLeft, ArrowRight, RotateCcw } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Lede, LinkList, Note } from '@/components/bits'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { partyStyle } from '@/lib/party'
import type { CompassElection } from '../../../shared/schema/election.ts'
import type { CompassState } from '../../../shared/stats/compass.ts'
import { CompassResults } from './compass-results'
import { useCompass } from './use-compass'

export function Compass({
  election,
  hash,
  onChange,
}: {
  election: CompassElection
  hash: string
  onChange?: (state: CompassState, hash: string) => void
}) {
  const api = useCompass(election, hash, onChange)
  const top = useRef<HTMLDivElement>(null)
  const { state } = api
  const key = state.done ? 'done' : state.i
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    top.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [key])
  return (
    <div ref={top} className="scroll-mt-20">
      {state.done ? (
        <CompassResults election={election} api={api} />
      ) : state.i < 0 ? (
        <Intro election={election} api={api} />
      ) : (
        <Question election={election} api={api} />
      )}
    </div>
  )
}

function Intro({
  election,
  api,
}: {
  election: CompassElection
  api: ReturnType<typeof useCompass>
}) {
  const answered = Object.keys(api.state.answers).length
  const facts =
    election.ballot === 'district' && election.facts.length
      ? election.facts
      : election.offices.map((o) => ({ n: o.voteFor, label: o.fact }))
  const parties = election.parties.filter((p) => p.url)
  return (
    <div className="space-y-8">
      <Lede>{election.lede}</Lede>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {facts.map((f, i) => (
          <div key={i} className="bg-card rounded-xl border p-4">
            <b className="nums block text-3xl font-bold tracking-tight">
              {f.n}
            </b>
            <span className="text-muted-foreground text-sm">{f.label}</span>
          </div>
        ))}
      </div>
      <p className="text-muted-foreground max-w-prose">{election.intro}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="lg" onClick={api.start}>
          {answered ? 'Continue' : 'Start the compass'}
          <ArrowRight className="size-4" />
        </Button>
        {answered ? (
          <Button type="button" variant="outline" size="lg" onClick={api.reset}>
            <RotateCcw className="size-4" />
            Start over
          </Button>
        ) : null}
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        {parties.length ? (
          <div className="space-y-1.5">
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Party websites
            </p>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {parties.map((p) => (
                <li key={p.key}>
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noopener"
                    className="inline-flex items-center gap-1.5 underline-offset-4 hover:underline"
                    style={partyStyle(p.key)}
                  >
                    <i className="swatch" aria-hidden="true" />
                    {p.short}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <LinkList eyebrow="Before you vote" links={election.resources} />
      </div>
    </div>
  )
}

function Question({
  election,
  api,
}: {
  election: CompassElection
  api: ReturnType<typeof useCompass>
}) {
  const { state } = api
  const i = state.i
  const q = election.questions[i]
  const n = election.questions.length
  const chosen = state.answers[i]
  const reviewing = state.review
  const double = !!state.weights[i]
  const nav = (where: 'top' | 'bottom') => (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={api.back}>
          <ArrowLeft className="size-4" />
          {i === 0 ? (reviewing ? 'Results' : 'Intro') : 'Back'}
        </Button>
        <Button type="button" variant="ghost" onClick={api.skip}>
          Skip
        </Button>
      </div>
      <Label className="flex cursor-pointer items-center gap-2 text-sm">
        <Checkbox
          checked={double}
          onCheckedChange={(v) => api.weigh(i, v === true)}
          aria-label="Counts double"
        />
        <span>
          Counts double{' '}
          <span className="text-muted-foreground hidden sm:inline">
            · this matters a lot to me
          </span>
        </span>
      </Label>
      <div className="flex gap-2">
        {reviewing && i > 0 ? (
          <Button type="button" variant="outline" onClick={api.finish}>
            Results
          </Button>
        ) : null}
        <Button
          type="button"
          onClick={api.next}
          disabled={chosen === undefined}
          data-nav={where}
        >
          {i === n - 1 ? 'See results' : 'Next'}
          <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  )
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Progress
          value={(i / n) * 100}
          aria-label={`Question ${i + 1} of ${n}`}
        />
        <div className="text-muted-foreground nums flex justify-between text-xs">
          <span>
            Question {i + 1} of {n}
            {reviewing ? ' · reviewing' : ''}
          </span>
          <span>{q.topic}</span>
        </div>
      </div>
      {nav('top')}
      <div className="space-y-3">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {q.topic}
        </p>
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {q.q}
        </h2>
        <p className="text-muted-foreground max-w-prose">{q.context}</p>
      </div>
      <div className="grid gap-2" role="group" aria-label="Answers">
        {q.opts.map((o, k) => {
          const on = chosen === k
          return (
            <button
              key={k}
              type="button"
              aria-pressed={on}
              onClick={() => api.answer(i, k)}
              className={`bg-card hover:border-foreground/40 focus-visible:ring-ring flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none ${on ? 'border-foreground ring-foreground/20 ring-1' : ''}`}
            >
              <span
                className={`mt-1 flex size-4 shrink-0 items-center justify-center rounded-full border ${on ? 'border-foreground bg-foreground' : 'border-muted-foreground/50'}`}
                aria-hidden="true"
              >
                {on ? (
                  <i className="bg-background block size-1.5 rounded-full" />
                ) : null}
              </span>
              <span className="min-w-0">
                <span className="block font-medium">{o.t}</span>
                <span className="text-muted-foreground block text-sm">
                  {o.s}
                </span>
              </span>
            </button>
          )
        })}
      </div>
      {nav('bottom')}
      <Note>
        Nothing you answer leaves this page; your answers stay in this browser
        and in the address bar.
      </Note>
    </div>
  )
}
