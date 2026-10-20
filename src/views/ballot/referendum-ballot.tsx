// Referendum mode: no parties to match, so the first tab is the viewer's own
// ballot. One mark per question, kept in this browser and in the hash
// (#/compass/<code>, "0" or "1" per question), with each question's wording,
// context, polls and, once results arrive, its running count.
import { RotateCcw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Eyebrow, ExternalLink, Lede, LinkList, Note } from '@/components/bits'
import { TwoOptionBar } from '@/components/charts/bars'
import { ShareButton } from '@/components/share-button'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { keys, readJson, writeJson } from '@/lib/storage'
import { fmt, pct1, pollDate } from '../../../shared/format.ts'
import type { Payload } from '../../../shared/payload.ts'
import {
  TAB,
  encodeBallot,
  parseBallot,
  type BallotMarks,
} from '../../../shared/permalink.ts'
import type {
  ReferendumElection,
  ReferendumQuestion,
} from '../../../shared/schema/election.ts'
import {
  ballotWide,
  contestOf,
  pollRange,
  reported,
  tally,
} from '../../../shared/stats/referendum.ts'

export function pollsText(q: ReferendumQuestion): string {
  const polls = q.polls || []
  if (!polls.length) return ''
  const [a, b] = q.options.map((o) => o.t)
  const yesNo = /^yes$/i.test(a)
  return polls
    .map((p) =>
      yesNo || p.pct[1] == null
        ? `${p.pct[0]}% ${a} (${p.by}, ${pollDate(p.date)})`
        : `${a} ${p.pct[0]}%, ${b} ${p.pct[1]}% (${p.by}, ${pollDate(p.date)})`,
    )
    .join(' · ')
}

export function reportedText(
  election: ReferendumElection,
  contest: ReturnType<typeof contestOf>,
): string {
  const r = reported(contest)
  if (!r.closed && !r.total) return ''
  const unit = election.results.unit || 'voting locations'
  const text = r.total
    ? `${fmt(r.closed)} of ${fmt(r.total)} ${unit} (${pct1((r.share || 0) * 100)})`
    : `${fmt(r.closed)} ${unit} reporting`
  return ballotWide(election) ? `${text}, whole ballot` : text
}

export function ReferendumBallot({
  election,
  hash: initialHash,
  latest,
  onChange,
}: {
  election: ReferendumElection
  hash: string
  latest: Payload | null
  onChange?: (marks: BallotMarks, hash: string) => void
}) {
  const slug = election.slug
  const [marks, setMarks] = useState<BallotMarks>(
    () =>
      parseBallot(election, initialHash) ||
      readJson<BallotMarks>(keys.ballot(slug), {}),
  )
  const encoded = encodeBallot(election, marks)
  const commit = useCallback(
    (next: BallotMarks) => {
      setMarks(next)
      writeJson(keys.ballot(slug), next)
      const target = encodeBallot(election, next)
      if (window.location.hash.startsWith(TAB) || Object.keys(next).length) {
        if (window.location.hash !== target)
          window.history.replaceState(null, '', target)
      }
      if (onChange) onChange(next, target)
    },
    [election, slug, onChange],
  )
  const mounted = useRef(false)
  useEffect(() => {
    if (mounted.current) return
    mounted.current = true
    writeJson(keys.ballot(slug), marks)
    if (
      window.location.hash.startsWith(TAB) &&
      window.location.hash !== encoded
    )
      window.history.replaceState(null, '', encoded)
    if (onChange) onChange(marks, encoded)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // Another code pasted into the address bar while the page is open.
  useEffect(() => {
    const onHash = () => {
      const next = parseBallot(election, window.location.hash)
      if (!next || encodeBallot(election, next) === encoded) return
      commit(next)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [election, commit, encoded])

  const Q = election.questions
  const marked = Q.filter((_q, i) => marks[i] === 0 || marks[i] === 1).length
  const groups = election.groups
  const url = `${window.location.origin}/${slug}${encoded}`
  const toggle = (i: number, k: 0 | 1) => {
    const next = { ...marks }
    if (next[i] === k) delete next[i]
    else next[i] = k
    commit(next)
  }

  return (
    <div className="space-y-10">
      <div className="space-y-3">
        <Lede>{election.lede}</Lede>
        <p className="text-muted-foreground max-w-prose">{election.intro}</p>
      </div>
      <div className="bg-background/90 sticky top-14 z-30 space-y-1 py-2 backdrop-blur">
        <div className="nums flex justify-between text-xs">
          <span className="font-medium">Your ballot</span>
          <span className="text-muted-foreground">
            {marked} of {Q.length} marked
          </span>
        </div>
        <Progress
          value={(100 * marked) / Q.length}
          aria-label={`${marked} of ${Q.length} marked`}
        />
      </div>

      {groups.map((g) => {
        const items = Q.map((q, i) => ({ q, i })).filter(
          ({ q }) => q.group === g.key,
        )
        if (!items.length) return null
        return (
          <section key={g.key} className="space-y-4">
            <div className="space-y-1">
              <h2 className="text-2xl font-semibold tracking-tight">
                {g.label}
              </h2>
              {g.order || g.note ? (
                <Note>{[g.order, g.note].filter(Boolean).join(' · ')}</Note>
              ) : null}
            </div>
            {items.map(({ q, i }) => {
              const mine = marks[i]
              const contest = contestOf(latest, q)
              const t = tally(contest)
              return (
                <article
                  key={q.n}
                  id={`q${q.n}`}
                  className="bg-card scroll-mt-28 space-y-4 rounded-xl border p-4 sm:p-5"
                >
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="bg-muted rounded px-1.5 py-0.5 text-xs font-medium">
                      Question {q.n}
                    </span>
                    <h3 className="text-lg font-semibold">{q.topic}</h3>
                  </div>
                  <p className="leading-relaxed">{q.q}</p>
                  <div
                    className="grid gap-2 sm:grid-cols-2"
                    role="group"
                    aria-label={`Question ${q.n}`}
                  >
                    {q.options.map((o, k) => {
                      const on = mine === k
                      return (
                        <button
                          key={k}
                          type="button"
                          aria-pressed={on}
                          onClick={() => toggle(i, k as 0 | 1)}
                          className={`hover:border-foreground/40 focus-visible:ring-ring flex items-start gap-3 rounded-lg border p-3 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none ${on ? 'border-foreground ring-foreground/20 ring-1' : ''}`}
                        >
                          <span
                            className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border ${on ? 'border-foreground bg-foreground' : 'border-muted-foreground/50'}`}
                            aria-hidden="true"
                          >
                            {on ? (
                              <i className="bg-background block size-1.5 rounded-sm" />
                            ) : null}
                          </span>
                          <span className="min-w-0">
                            <span className="block font-medium">{o.t}</span>
                            {o.full ? (
                              <span className="text-muted-foreground block text-sm">
                                {o.full}
                              </span>
                            ) : null}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {q.context}
                  </p>
                  {q.polls.length ? <Note>Polls: {pollsText(q)}</Note> : null}
                  {latest ? (
                    <div className="space-y-1.5">
                      <Eyebrow>Count so far</Eyebrow>
                      <TwoOptionBar
                        a={q.options[0].t}
                        b={q.options[1].t}
                        shares={t.shares}
                        votes={t.votes}
                        lead={t.lead}
                        started={t.started}
                      />
                      {t.started ? (
                        <Note>{reportedText(election, contest)}</Note>
                      ) : null}
                    </div>
                  ) : null}
                  {mine === 0 || mine === 1 ? (
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-4"
                      onClick={() => toggle(i, mine)}
                    >
                      Clear my mark
                    </button>
                  ) : null}
                </article>
              )
            })}
          </section>
        )
      })}

      {election.pollNote ? <Note>{election.pollNote}</Note> : null}

      {marked ? (
        <section className="bg-card space-y-4 rounded-xl border p-4 sm:p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">Your ballot</h2>
            <span className="text-muted-foreground nums text-xs">
              {marked} of {Q.length} marked
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-xs">
                  <th className="py-1.5 pr-3 font-medium">Question</th>
                  <th className="py-1.5 pr-3 font-medium">You</th>
                  <th className="py-1.5 pr-3 font-medium">Polls</th>
                  {latest ? (
                    <th className="py-1.5 font-medium">Count so far</th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {Q.map((q, i) => {
                  const k = marks[i]
                  const has = k === 0 || k === 1
                  const t = tally(contestOf(latest, q))
                  const range = has ? pollRange(q, k) : null
                  return (
                    <tr key={q.n} className="border-b last:border-0">
                      <td className="py-1.5 pr-3">
                        <a
                          href={`#q${q.n}`}
                          className="underline-offset-4 hover:underline"
                        >
                          Q{q.n}
                        </a>{' '}
                        {q.topic}
                      </td>
                      <td className="py-1.5 pr-3">
                        {has ? (
                          <b>{q.options[k].t}</b>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="nums py-1.5 pr-3">
                        {range
                          ? `${range.lo === range.hi ? range.lo : `${range.lo}-${range.hi}`}%`
                          : ''}
                      </td>
                      {latest ? (
                        <td className="nums py-1.5">
                          {has && t.started
                            ? `${q.options[k].t} ${pct1(t.shares[k])}`
                            : ''}
                        </td>
                      ) : null}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Note>
            Polls: the polled share for your choice, where polls asked.
            {latest
              ? " Count so far: your choice's share of the votes counted on that question."
              : ''}
          </Note>
          <div className="flex flex-wrap items-center justify-between gap-4 border-t pt-4">
            <div>
              <p className="font-medium">Share your ballot</p>
              <Note>
                This page's address is a permalink to these marks: they are in
                the link, not on a server.
              </Note>
            </div>
            <div className="flex items-center gap-2">
              <ShareButton
                url={url}
                title={`${election.title}: my ballot`}
                label="Share ballot"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => commit({})}
              >
                <RotateCcw className="size-4" />
                Clear all
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      <div className="grid gap-6 sm:grid-cols-2">
        <LinkList eyebrow="Before you vote" links={election.resources} />
        <LinkList
          eyebrow="Wording, context and polls from"
          links={election.sources}
        />
      </div>
      {election.results.official ? (
        <Note>
          Counts, once they start, come from{' '}
          <ExternalLink href={election.results.official}>
            {election.results.label || 'the official results page'}
          </ExternalLink>
          .
        </Note>
      ) : null}
    </div>
  )
}
