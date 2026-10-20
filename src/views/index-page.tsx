// The index: every published election as a card, newest voting day first.
import { ArrowRight } from 'lucide-react'
import { Shell } from '@/components/shell'
import { StatusBadge } from '@/components/bits'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { dateStatus } from '@/lib/election-status'
import { todayIn } from '@/lib/time'
import { useElectionList } from '@/lib/use-election'
import { dayLong } from '../../shared/format.ts'

const BALLOT_LABEL = {
  'at-large': 'City-wide ballot',
  district: 'Riding by riding',
  referendum: 'Referendum',
} as const

export function IndexPage() {
  const { status, rows } = useElectionList()
  const today = todayIn('UTC')
  return (
    <Shell>
      <section className="space-y-10">
        <div className="max-w-2xl space-y-3">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Know your ballot. Watch the count.
          </h1>
          <p className="text-muted-foreground text-lg leading-relaxed">
            A compass that matches your answers to the parties and candidates on
            your ballot, then live results on election night, riding by riding,
            seat by seat, question by question.
          </p>
        </div>
        <div className="space-y-3">
          <h2 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
            Elections
          </h2>
          {status === 'loading' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-40 rounded-xl" />
              ))}
            </div>
          ) : status === 'error' ? (
            <p className="text-muted-foreground">
              The elections could not be loaded. Try again in a moment.
            </p>
          ) : rows.length ? (
            <ul className="grid gap-4 sm:grid-cols-2">
              {rows.map((r) => {
                const day = r.voting_day.slice(0, 10)
                return (
                  <li key={r.id}>
                    <a
                      href={`/${r.slug}`}
                      className="group block h-full focus-visible:outline-none"
                    >
                      <Card className="group-hover:border-foreground/30 group-focus-visible:ring-ring h-full gap-3 p-5 transition-colors group-focus-visible:ring-2">
                        <div className="flex items-center justify-between gap-2">
                          <StatusBadge status={dateStatus([], day, today)} />
                          <Badge variant="outline">
                            {BALLOT_LABEL[r.ballot] || r.ballot}
                          </Badge>
                        </div>
                        <h3 className="text-xl font-semibold tracking-tight">
                          {r.title}
                        </h3>
                        <p className="text-muted-foreground text-sm">
                          {dayLong(day)}
                        </p>
                        <p className="text-sm leading-relaxed">
                          {r.description}
                        </p>
                        <span className="text-muted-foreground group-hover:text-foreground mt-auto inline-flex items-center gap-1 text-sm font-medium">
                          Open{' '}
                          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                        </span>
                      </Card>
                    </a>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-muted-foreground">No elections yet.</p>
          )}
        </div>
      </section>
    </Shell>
  )
}
