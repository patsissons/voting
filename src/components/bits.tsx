// Small shared pieces: party chips, external links, section frames, the
// table-behind-a-chart, and status badges.
import type { CSSProperties, ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { partyStyle } from '@/lib/party'
import { STATUS_LABEL, type Status } from '@/lib/election-status'
import type { Link } from '../../shared/schema/election.ts'

export function Swatch({
  party,
  className = '',
}: {
  party: string | null | undefined
  className?: string
}) {
  return (
    <i
      className={`swatch ${className}`}
      style={partyStyle(party)}
      aria-hidden="true"
    />
  )
}

/** A swatch and a short party name. */
export function PartyChip({
  party,
  label,
  className = '',
}: {
  party: string | null | undefined
  label: string
  className?: string
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium ${className}`}
      style={partyStyle(party)}
    >
      <Swatch party={party} />
      {label}
    </span>
  )
}

export function ExternalLink({
  href,
  children,
  className = '',
}: {
  href: string
  children: ReactNode
  className?: string
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      className={`text-foreground underline decoration-[var(--border)] underline-offset-4 hover:decoration-current ${className}`}
    >
      {children}
    </a>
  )
}

/** An eyebrow and a row of links (sources, resources, where to follow). */
export function LinkList({
  eyebrow,
  links,
  className = '',
}: {
  eyebrow: string
  links: Link[]
  className?: string
}) {
  if (!links.length) return null
  return (
    <div className={`space-y-1.5 ${className}`}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {links.map((l) => (
          <li key={l.url}>
            <ExternalLink href={l.url}>{l.label}</ExternalLink>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function Eyebrow({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <p
      className={`text-muted-foreground text-xs font-medium tracking-wide uppercase ${className}`}
    >
      {children}
    </p>
  )
}

/** A results section: anchored heading, a right-hand sub line, content. */
export function Section({
  id,
  title,
  sub,
  children,
  className = '',
  style,
}: {
  id: string
  title: ReactNode
  sub?: ReactNode
  children: ReactNode
  className?: string
  style?: CSSProperties
}) {
  return (
    <section
      id={id}
      className={`bg-card text-card-foreground scroll-mt-20 space-y-4 rounded-xl border p-4 sm:p-5 ${className}`}
      style={style}
      aria-labelledby={`${id}-title`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={`${id}-title`} className="text-lg font-semibold tracking-tight">
          {title}
        </h2>
        {sub ? (
          <span className="text-muted-foreground nums text-xs">{sub}</span>
        ) : null}
      </div>
      {children}
    </section>
  )
}

/** A group heading between sections of the results page. */
export function GroupHead({
  id,
  children,
}: {
  id: string
  children: ReactNode
}) {
  return (
    <h2
      id={id}
      className="text-muted-foreground scroll-mt-20 pt-4 text-xs font-semibold tracking-wider uppercase"
    >
      {children}
    </h2>
  )
}

/** The numbers behind a chart, folded away. */
export function DataTable({
  heads,
  rows,
  summary = 'Table',
}: {
  heads: ReactNode[]
  rows: ReactNode[][]
  summary?: string
}) {
  return (
    <details className="text-sm">
      <summary className="text-muted-foreground hover:text-foreground text-xs">
        {summary}
      </summary>
      <div className="mt-2 overflow-x-auto">
        <table className="nums w-full text-left text-xs">
          <thead>
            <tr className="border-b">
              {heads.map((h, i) => (
                <th key={i} className="py-1.5 pr-3 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b last:border-0">
                {r.map((v, j) => (
                  <td key={j} className="py-1.5 pr-3 align-top">
                    {v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

export function Note({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <p className={`text-muted-foreground text-xs leading-relaxed ${className}`}>
      {children}
    </p>
  )
}

export function StatusBadge({
  status,
  live = false,
}: {
  status: Status
  live?: boolean
}) {
  const variant =
    status === 'counting'
      ? 'default'
      : status === 'voting'
        ? 'secondary'
        : 'outline'
  return (
    <Badge variant={variant} className="gap-1.5">
      {live || status === 'counting' ? (
        <i
          className="bg-brand inline-block size-1.5 animate-pulse rounded-full"
          aria-hidden="true"
        />
      ) : null}
      {STATUS_LABEL[status]}
    </Badge>
  )
}

export function Lede({ children }: { children: ReactNode }) {
  return (
    <p className="text-foreground/90 max-w-prose text-base leading-relaxed sm:text-lg">
      {children}
    </p>
  )
}
