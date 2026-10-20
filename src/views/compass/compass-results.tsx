// The compass results: ranked party matches, the two-axis plane, the ballot
// card (at-large) or riding card (district), the per-question breakdown and
// the share row. The address is a permalink to these results.
import { RotateCcw, SearchCheck } from 'lucide-react'
import { useMemo } from 'react'
import {
  DataTable,
  ExternalLink,
  LinkList,
  Note,
  Swatch,
} from '@/components/bits'
import { Plane } from '@/components/charts/plane'
import { ShareButton } from '@/components/share-button'
import { Button } from '@/components/ui/button'
import { partyColor, partyLookup, partyStyle } from '@/lib/party'
import type { CompassElection } from '../../../shared/schema/election.ts'
import { position, score } from '../../../shared/stats/compass.ts'
import { BallotCard } from './ballot-card'
import { RidingCard } from './riding-card'
import type { CompassApi } from './use-compass'

/** "0.4 left" / "centre" for an axis value. */
export const side = (v: number, neg: string, pos: string) =>
  Math.abs(v) < 0.05
    ? 'centre'
    : `${Math.abs(v).toFixed(1)} ${v < 0 ? neg : pos}`

export function CompassResults({
  election,
  api,
}: {
  election: CompassElection
  api: CompassApi
}) {
  const { state } = api
  const P = useMemo(() => partyLookup(election), [election])
  const { answered, rows } = useMemo(
    () => score(election, state),
    [election, state],
  )
  const you = useMemo(() => position(election, state), [election, state])
  const url = `${window.location.origin}/${election.slug}${api.hash}`

  if (!answered) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight">
          No answers yet
        </h2>
        <p className="text-muted-foreground">
          You skipped every question, so there is nothing to score.
        </p>
        <Button type="button" onClick={api.reset}>
          <RotateCcw className="size-4" />
          Start over
        </Button>
      </div>
    )
  }
  const tie = rows[0].pct - rows[1].pct <= 5
  const plotted = election.parties.filter((p) => p.axis)
  const Q = election.questions

  return (
    <div className="space-y-10">
      <div className="space-y-2">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Your results · {answered} of {Q.length} questions scored
        </p>
        <h2 className="text-3xl font-bold tracking-tight">
          Closest to{' '}
          <span style={{ color: partyColor(rows[0].p) }}>
            {P[rows[0].p].name}
          </span>
        </h2>
        <p className="text-muted-foreground max-w-prose">
          {tie
            ? 'It is close at the top, so look at the next party down as well. '
            : ''}
          Scores show how much of each party's stated platform lines up with
          your answers. A party with no public position on a topic earns nothing
          there.
        </p>
      </div>

      <ol className="space-y-3">
        {rows.map((r, idx) => {
          const p = P[r.p]
          return (
            <li
              key={r.p}
              className={`bg-card rounded-xl border p-4 ${idx === 0 ? 'ring-foreground/15 ring-1' : ''}`}
              style={partyStyle(r.p)}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2 font-semibold">
                  <Swatch party={r.p} />
                  {p.url ? (
                    <ExternalLink href={p.url}>{p.name}</ExternalLink>
                  ) : (
                    p.name
                  )}
                </span>
                <b className="nums text-xl">{r.pct}%</b>
              </div>
              <div className="bg-muted mt-2 h-2 overflow-hidden rounded-full">
                <i
                  className="block h-full rounded-full"
                  style={{ width: `${r.pct}%`, background: partyColor(r.p) }}
                />
              </div>
              <p className="text-muted-foreground mt-2 text-sm">{p.lean}</p>
            </li>
          )
        })}
      </ol>

      {plotted.length ? (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight">
            Where you sit
          </h2>
          <p className="text-muted-foreground max-w-prose text-sm">
            Economic left to right across, social conservative to progressive
            up. Parties are placed from their platforms; you are placed from
            your answers, so you can land away from your closest match when you
            agree with it on the questions you weighted most.
          </p>
          <div className="bg-card rounded-xl border p-3">
            <Plane
              points={plotted.map((p) => ({
                key: p.key,
                label: p.short,
                name: p.name,
                color: partyColor(p.key),
                x: p.axis.e,
                y: p.axis.s,
              }))}
              you={you.n ? { x: you.e, y: you.s } : null}
              xLabels={['Economic left', 'Economic right']}
              yLabels={['Progressive', 'Conservative']}
              describe={(pt) => ({
                title: ('name' in pt && pt.name) || pt.label,
                lines: [
                  { label: 'Economic', value: side(pt.x, 'left', 'right') },
                  {
                    label: 'Social',
                    value: side(pt.y, 'conservative', 'progressive'),
                  },
                ],
              })}
              ariaLabel="Parties and you on an economic left-right and social conservative-progressive plane"
            />
          </div>
          <DataTable
            summary="As a table"
            heads={['Who', 'Economic', 'Social']}
            rows={[
              ...(you.n
                ? [
                    [
                      <b key="you">You</b>,
                      side(you.e, 'left', 'right'),
                      side(you.s, 'conservative', 'progressive'),
                    ],
                  ]
                : []),
              ...plotted.map((p) => [
                <span key={p.key} className="inline-flex items-center gap-1.5">
                  <Swatch party={p.key} />
                  {p.name}
                </span>,
                side(p.axis.e, 'left', 'right'),
                side(p.axis.s, 'conservative', 'progressive'),
              ]),
            ]}
          />
        </section>
      ) : null}

      {election.ballot === 'district' ? (
        <RidingCard election={election} rows={rows} hash={api.hash} />
      ) : (
        <BallotCard election={election} rows={rows} hash={api.hash} />
      )}

      <details className="bg-card rounded-xl border p-4">
        <summary className="font-medium">How each answer scored</summary>
        <div className="mt-4 space-y-4">
          {Q.map((q, i) => {
            const k = state.answers[i]
            const o = k === undefined ? null : q.opts[k]
            const ps = o
              ? Object.entries(o.pts).sort((a, b) => b[1] - a[1])
              : []
            return (
              <div key={i} className="space-y-1 text-sm">
                <p className="font-medium">
                  {q.q}
                  {state.weights[i] ? (
                    <span className="bg-muted ml-2 rounded px-1.5 py-0.5 text-xs">
                      ×2
                    </span>
                  ) : null}
                </p>
                {o ? (
                  <>
                    <p className="text-muted-foreground">{o.t}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {ps.length ? (
                        ps.map(([p, v]) => (
                          <span
                            key={p}
                            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs ${v === 3 ? 'font-semibold' : ''}`}
                          >
                            <Swatch party={p} />
                            {P[p].short} +{v}
                          </span>
                        ))
                      ) : (
                        <span className="text-muted-foreground rounded-full border px-2 py-0.5 text-xs">
                          neutral
                        </span>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="text-muted-foreground">Skipped</p>
                )}
              </div>
            )
          })}
        </div>
      </details>

      {election.note ? (
        <Note>
          {election.note.text}
          {election.note.link ? (
            <>
              {' '}
              <ExternalLink href={election.note.link.url}>
                {election.note.link.label}
              </ExternalLink>
              .
            </>
          ) : null}
        </Note>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={api.review}>
          <SearchCheck className="size-4" />
          Review answers
        </Button>
        <Button type="button" variant="outline" onClick={api.reset}>
          <RotateCcw className="size-4" />
          Start over
        </Button>
      </div>

      <div className="bg-card flex flex-wrap items-center justify-between gap-4 rounded-xl border p-4">
        <div>
          <p className="font-medium">Share your results</p>
          <Note>
            This page's address is a permalink to these results: your answers
            are in the link, not on a server.
          </Note>
        </div>
        <ShareButton
          url={url}
          title={`${election.title}: my compass results`}
          label="Share results"
        />
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <LinkList eyebrow="Before you vote" links={election.resources} />
        <LinkList eyebrow="Positions drawn from" links={election.sources} />
      </div>
    </div>
  )
}
