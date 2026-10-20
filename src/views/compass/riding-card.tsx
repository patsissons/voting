// The district ballot: pick a riding (searchable, grouped by region), see
// its candidates in match order, then the top matches' leaders and what they
// run where the viewer lives. The riding is kept in this browser, never in
// the hash.
import { Check, ChevronsUpDown, Copy } from 'lucide-react'
import { useState } from 'react'
import { ExternalLink, Note, Swatch } from '@/components/bits'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { partyLookup, partyStyle } from '@/lib/party'
import { copyText } from '@/lib/share'
import { keys, readString, writeString } from '@/lib/storage'
import type { DistrictElection } from '../../../shared/schema/election.ts'
import {
  ridingCard,
  type RidingCandidate,
  type ScoreRow,
} from '../../../shared/stats/compass.ts'

export function RidingPicker({
  election,
  value,
  onChange,
  label = 'Your riding',
}: {
  election: DistrictElection
  value: string
  onChange: (code: string) => void
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const current = election.districts.find((d) => d.code === value)
  const regions = election.regions.length
    ? election.regions
    : [{ key: '', label: 'All ridings' }]
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={label}
          className="w-full justify-between sm:w-80"
        >
          <span className="truncate">
            {current ? current.name : 'Choose a riding'}
          </span>
          <ChevronsUpDown className="size-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] min-w-72 p-0"
        align="start"
      >
        <Command>
          <CommandInput placeholder="Search ridings" />
          <CommandList>
            <CommandEmpty>No riding found.</CommandEmpty>
            {regions.map((reg) => {
              const list = election.districts.filter(
                (d) => !reg.key || d.region === reg.key,
              )
              if (!list.length) return null
              return (
                <CommandGroup key={reg.key} heading={reg.label}>
                  {list.map((d) => (
                    <CommandItem
                      key={d.code}
                      value={`${d.name} ${d.code}`}
                      onSelect={() => {
                        onChange(d.code === value ? '' : d.code)
                        setOpen(false)
                      }}
                    >
                      <Check
                        className={`size-4 ${d.code === value ? 'opacity-100' : 'opacity-0'}`}
                      />
                      {d.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export function RidingCard({
  election,
  rows,
  hash,
}: {
  election: DistrictElection
  rows: ScoreRow[]
  hash: string
}) {
  const P = partyLookup(election)
  const [code, setCode] = useState(() =>
    readString(keys.district(election.slug)),
  )
  const pick = (next: string) => {
    setCode(next)
    writeString(keys.district(election.slug), next)
  }
  const riding =
    ridingCard(election, rows, code) || ridingCard(election, rows, '')!
  const d = riding.district
  const lead = rows.slice(0, 3)
  const [copied, setCopied] = useState<'idle' | 'ok' | 'failed'>('idle')
  const copy = async () => {
    const lines = [
      `${election.title}: my ballot from the compass`,
      `${d!.name}: ${riding.picks.map((c, i) => `${i + 1}. ${c.name} (${P[c.party!].short}, ${c.pct}%)`).join(', ') || 'no match running here'}`,
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
  const candidate = (c: RidingCandidate, ranked: boolean) => (
    <li
      key={c.name}
      className={`nums inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-sm ${c.inc ? 'border-foreground/50' : ''}`}
      style={partyStyle(c.party)}
    >
      <Swatch party={c.party} />
      {ranked ? <b>{c.pct}%</b> : null}
      {c.name}
      <small className="text-muted-foreground">
        {c.party ? P[c.party].short : c.partyName}
      </small>
    </li>
  )
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">Your riding</h2>
        <p className="text-muted-foreground max-w-prose text-sm">
          You have one vote, for one {election.offices[0]?.label || 'member'},
          and only the candidates in your riding are on your ballot. Pick it to
          see them in the order of your matches; the ones from parties you
          scored nothing on are listed after.{' '}
          {election.dates.url ? (
            <>
              Not sure which riding you are in?{' '}
              <ExternalLink href={election.dates.url}>Look it up</ExternalLink>.
            </>
          ) : null}
        </p>
        <div className="bg-card space-y-4 rounded-xl border p-4">
          <RidingPicker election={election} value={code} onChange={pick} />
          {d ? (
            <>
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-semibold">{d.name}</h3>
                <span className="text-muted-foreground nums text-xs">
                  {d.candidates.length} on the ballot
                  {d.last && d.last.party
                    ? ` · last time: ${P[d.last.party].short} by ${d.last.margin} points`
                    : ''}
                </span>
              </div>
              {riding.picks.length ? (
                <ul className="flex flex-wrap gap-2">
                  {riding.picks.map((c) => candidate(c, true))}
                </ul>
              ) : (
                <p className="text-muted-foreground text-sm">
                  None of your matches run here.
                </p>
              )}
              {riding.others.length ? (
                <>
                  <p className="text-muted-foreground text-xs">
                    Also on the ballot
                  </p>
                  <ul className="flex flex-wrap gap-2">
                    {riding.others.map((c) => candidate(c, false))}
                  </ul>
                </>
              ) : null}
              <div className="flex flex-wrap items-center gap-3 border-t pt-4">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={copy}
                >
                  <Copy className="size-4" />
                  {copied === 'ok'
                    ? 'Copied'
                    : copied === 'failed'
                      ? 'Copy failed'
                      : 'Copy this ballot'}
                </Button>
                <Note>Sitting members are outlined.</Note>
              </div>
            </>
          ) : (
            <p className="text-muted-foreground text-sm">
              Choose a riding to see your ballot.
            </p>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">
          Your top matches
        </h2>
        <p className="text-muted-foreground max-w-prose text-sm">
          Who leads them, how much of the province they contest, and who they
          are running where you live.
        </p>
        <div className="grid gap-4 lg:grid-cols-3">
          {lead.map((r) => {
            const p = P[r.p]
            const here = d ? d.candidates.find((c) => c[1] === r.p) : null
            return (
              <div
                key={r.p}
                className="bg-card space-y-2 rounded-xl border p-4 text-sm"
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
                  <span className="text-muted-foreground nums">{r.pct}%</span>
                </h3>
                {p.leader ? (
                  <p className="flex justify-between gap-2">
                    <b>Leader</b>
                    <span>{p.leader}</span>
                  </p>
                ) : null}
                {p.candidates != null ? (
                  <p className="flex justify-between gap-2">
                    <b>Candidates</b>
                    <span className="nums">
                      {p.candidates} of {election.seats} ridings
                    </span>
                  </p>
                ) : null}
                {d ? (
                  <p className="flex justify-between gap-2">
                    <b>{d.name}</b>
                    <span>
                      {here
                        ? `${here[0]}${here[2] ? ' (sitting)' : ''}`
                        : 'no candidate'}
                    </span>
                  </p>
                ) : null}
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
