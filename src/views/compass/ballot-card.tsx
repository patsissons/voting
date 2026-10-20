// The at-large ballot card: every vote the viewer has, filled from the
// ranking (shared/stats/compass ballotCard), with swaps kept in this browser,
// then the top three parties' slates.
import { Copy, RotateCcw, Undo2, X } from 'lucide-react'
import { useState } from 'react'
import { ExternalLink, Note, Swatch } from '@/components/bits'
import { Button } from '@/components/ui/button'
import { copyText } from '@/lib/share'
import { partyLookup, partyStyle } from '@/lib/party'
import { keys, readJson, writeJson, remove } from '@/lib/storage'
import type {
  AtLargeElection,
  SlateRow,
} from '../../../shared/schema/election.ts'
import {
  ballotCard,
  type Pick_,
  type ScoreRow,
} from '../../../shared/stats/compass.ts'

function loadOmit(slug: string): number[] {
  const list = readJson<unknown>(keys.omit(slug), [])
  return Array.isArray(list)
    ? list.filter((n): n is number => typeof n === 'number')
    : []
}

export function BallotCard({
  election,
  rows,
  hash,
}: {
  election: AtLargeElection
  rows: ScoreRow[]
  hash: string
}) {
  const P = partyLookup(election)
  const [omit, setOmit] = useState(() => loadOmit(election.slug))
  const saveOmit = (list: number[]) => {
    setOmit(list)
    if (list.length) writeJson(keys.omit(election.slug), list)
    else remove(keys.omit(election.slug))
  }
  const card = ballotCard(election, rows, omit)
  const lead = rows.slice(0, 3)
  const multi = election.offices.filter((o) => o.voteFor > 1)
  const [copied, setCopied] = useState<'idle' | 'ok' | 'failed'>('idle')
  const copy = async () => {
    const lines = [
      `${election.title}: my ballot from the compass`,
      ...card.map(
        (o) =>
          `${o.label} (vote for ${o.voteFor}): ${o.picks.map((c) => `${c.ballot} ${c.name} (${P[c.party].short})`).join(', ') || 'none'}`,
      ),
    ]
    setCopied(
      (await copyText(
        [...lines, `${window.location.origin}/${election.slug}${hash}`].join(
          '\n',
        ),
      ))
        ? 'ok'
        : 'failed',
    )
    setTimeout(() => setCopied('idle'), 1500)
  }
  const partiesUsed = card
    .flatMap((o) => o.picks.map((c) => c.party))
    .filter((k, i, a) => a.indexOf(k) === i)

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">
          A ballot to start from
        </h2>
        <p className="text-muted-foreground max-w-prose text-sm">
          Every vote you have, filled from your closest match first and then the
          next party down until each office is full, sitting members ahead of
          newcomers. It is a starting point, not advice: swap out anyone to pull
          in the next best for that office (swapped-out names stay listed, so
          you can bring them back), and leave votes blank if you like. Numbers
          are the ballot numbers printed beside each name.
        </p>
        <div className="bg-card space-y-5 rounded-xl border p-4">
          {card.map((o) => (
            <div key={o.key} className="space-y-2">
              <div className="flex items-baseline justify-between">
                <h3 className="font-semibold">{o.label}</h3>
                <span className="text-muted-foreground nums text-xs">
                  {o.picks.length} of {o.voteFor}
                </span>
              </div>
              {o.list.length ? (
                <ul className="flex flex-wrap gap-2">
                  {o.list.map((c) => (
                    <PickChip
                      key={c.ballot}
                      pick={c}
                      onSwap={(ballot, out) =>
                        saveOmit(
                          out
                            ? [...omit.filter((b) => b !== ballot), ballot]
                            : omit.filter((b) => b !== ballot),
                        )
                      }
                    />
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground text-sm">
                  No one to suggest.
                </p>
              )}
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-3 border-t pt-4">
            <Button type="button" variant="outline" size="sm" onClick={copy}>
              <Copy className="size-4" />
              {copied === 'ok'
                ? 'Copied'
                : copied === 'failed'
                  ? 'Copy failed'
                  : 'Copy this ballot'}
            </Button>
            {omit.length ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => saveOmit([])}
              >
                <RotateCcw className="size-4" />
                Undo swaps
              </Button>
            ) : null}
            <span className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
              Parties:
              {partiesUsed.map((k) => (
                <span key={k} className="inline-flex items-center gap-1">
                  <Swatch party={k} />
                  {P[k].short}
                </span>
              ))}
            </span>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">On your ballot</h2>
        <p className="text-muted-foreground max-w-prose text-sm">
          Your top three matches and the names they are running.
          {multi.length
            ? ` You can vote for up to ${multi.map((o) => `${o.voteFor} for ${o.label}`).join(', ')}, and they do not have to come from one party.`
            : ''}
        </p>
        <div className="grid gap-4 lg:grid-cols-3">
          {lead.map((r) => {
            const p = P[r.p]
            return (
              <div
                key={r.p}
                className="bg-card space-y-3 rounded-xl border p-4"
                style={partyStyle(r.p)}
              >
                <h3 className="flex items-center justify-between gap-2 font-semibold">
                  <span className="flex items-center gap-2">
                    <Swatch party={r.p} />
                    {p.url ? (
                      <ExternalLink href={p.url}>{p.name}</ExternalLink>
                    ) : (
                      p.name
                    )}
                  </span>
                  <span className="text-muted-foreground nums text-sm">
                    {r.pct}%
                  </span>
                </h3>
                {election.offices.map((o) => {
                  const slate: SlateRow[] =
                    o.key === 'mayor'
                      ? p.mayor
                        ? [p.mayor]
                        : []
                      : p[o.key as 'council' | 'park' | 'school'] || []
                  return (
                    <div key={o.key} className="space-y-1">
                      <div className="flex items-baseline justify-between text-sm">
                        <b>{o.label}</b>
                        <span className="text-muted-foreground nums text-xs">
                          {o.key === 'mayor'
                            ? 'vote for 1'
                            : `${slate.length} running · vote for up to ${o.voteFor}`}
                        </span>
                      </div>
                      {slate.length ? (
                        <ul className="flex flex-wrap gap-1.5">
                          {slate.map(([n, name, inc]) => (
                            <li
                              key={n}
                              className={`nums inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs ${inc ? 'border-foreground/50' : ''}`}
                            >
                              <b>{n}</b>
                              {name}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-muted-foreground text-xs">
                          {o.key === 'mayor'
                            ? p.endorses || 'No candidate.'
                            : 'No candidates.'}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
        <Note>Sitting members are outlined.</Note>
      </section>
    </div>
  )
}

function PickChip({
  pick,
  onSwap,
}: {
  pick: Pick_
  onSwap: (ballot: number, out: boolean) => void
}) {
  return (
    <li
      className={`nums inline-flex items-center gap-1.5 rounded-md border py-1 pr-1 pl-2 text-sm ${pick.inc ? 'border-foreground/50' : ''} ${pick.out ? 'text-muted-foreground border-dashed line-through' : ''} ${pick.in ? 'bg-muted' : ''}`}
      style={partyStyle(pick.party)}
    >
      <Swatch party={pick.party} />
      <b>{pick.ballot}</b>
      <span>{pick.name}</span>
      {pick.out ? (
        <small className="text-muted-foreground no-underline">out</small>
      ) : pick.in ? (
        <small className="text-muted-foreground">in</small>
      ) : null}
      <button
        type="button"
        onClick={() => onSwap(pick.ballot, !pick.out)}
        aria-label={
          pick.out ? `Swap ${pick.name} back in` : `Swap out ${pick.name}`
        }
        title={pick.out ? 'Swap back in' : 'Swap out'}
        className="hover:bg-muted text-muted-foreground hover:text-foreground ml-1 rounded p-0.5"
      >
        {pick.out ? <Undo2 className="size-3.5" /> : <X className="size-3.5" />}
      </button>
    </li>
  )
}
