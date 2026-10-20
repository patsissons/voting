export type LegendItem = { label: string; color: string; line?: boolean }

/** The legend: always there for two or more series. */
export function Legend({
  items,
  className = '',
}: {
  items: LegendItem[]
  className?: string
}) {
  return (
    <div
      className={`text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs ${className}`}
    >
      {items.map((s, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          <i
            className={
              s.line
                ? 'inline-block h-0.5 w-4 rounded'
                : 'inline-block h-2.5 w-2.5 rounded-sm'
            }
            style={{ background: s.color }}
            aria-hidden="true"
          />
          {s.label}
        </span>
      ))}
    </div>
  )
}
