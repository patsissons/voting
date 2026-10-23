// The results map: a province's electoral divisions filled by the caller,
// with city insets where the urban divisions are too small to read. The
// geometry (src/geo/<set>.json, `pnpm geo`) loads on first use into its own
// hashed chunk. Province paths take keyboard focus; the insets repeat the
// same divisions for the pointer, so focus does not visit them twice.
import { useEffect, useId, useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import type { BoundarySet, Frame } from '../../../shared/geo.ts'
import type { BoundarySetKey } from '../../../shared/schema/election.ts'
import { tipHandlersFor, useTip, type TipContent } from './tooltip'

const SOURCES = import.meta.glob<BoundarySet>('../../geo/*.json', {
  import: 'default',
})
const cache = new Map<string, BoundarySet>()

/** A boundary set by key, from the cache or its chunk. */
export function loadBoundaries(key: BoundarySetKey): Promise<BoundarySet> {
  const hit = cache.get(key)
  if (hit) return Promise.resolve(hit)
  const load = SOURCES[`../../geo/${key}.json`]
  if (!load) return Promise.reject(new Error(`no boundary set ${key}`))
  return load().then((set) => {
    cache.set(key, set)
    return set
  })
}

type Props = {
  set: BoundarySetKey
  /** A CSS fill per division code; the rest are drawn muted. */
  fills: Record<string, string>
  describe: (code: string) => TipContent
  /** The viewer's own division, outlined. */
  ring?: string
  /** Divisions drawn with a hatched fill (a reading apart from every colour), such as no data of this kind. */
  hatched?: readonly string[]
  ariaLabel: string
}

export function Choropleth(props: Props) {
  // Keyed by the set it was loaded for, so a new set never shows the old one.
  const [state, setState] = useState<{
    key: string
    data: BoundarySet | null
    failed: boolean
  }>({ key: props.set, data: null, failed: false })
  useEffect(() => {
    if (cache.has(props.set)) return
    let live = true
    loadBoundaries(props.set).then(
      (data) => live && setState({ key: props.set, data, failed: false }),
      () => live && setState({ key: props.set, data: null, failed: true }),
    )
    return () => {
      live = false
    }
  }, [props.set])
  const mine = state.key === props.set
  const data = cache.get(props.set) || (mine ? state.data : null)
  if (!data && mine && state.failed)
    return (
      <p className="text-muted-foreground text-sm">The map did not load.</p>
    )
  if (!data) return <Skeleton className="aspect-square w-full max-w-lg" />
  const [province, ...insets] = data.frames
  return (
    <figure className="space-y-2">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[3fr_2fr]">
        <MapFrame
          frame={province}
          {...props}
          focusable
          className="sm:col-span-2 lg:col-span-1 lg:row-span-2"
        />
        {insets.map((f) => (
          <MapFrame key={f.key} frame={f} {...props} inset />
        ))}
      </div>
      <figcaption className="text-muted-foreground text-xs">
        {data.attribution}
      </figcaption>
    </figure>
  )
}

function MapFrame({
  frame,
  fills,
  describe,
  ring,
  hatched,
  ariaLabel,
  focusable = false,
  inset = false,
  className = '',
}: Props & {
  frame: Frame
  focusable?: boolean
  inset?: boolean
  className?: string
}) {
  const tip = useTip()
  const [w, h] = frame.viewBox
  const codes = Object.keys(frame.paths)
  // One pattern per frame: the province and its insets share the document.
  const hatchId = `${useId()}-hatch`
  const isHatched = new Set(hatched || [])
  return (
    <div className={`space-y-1 ${className}`} data-frame={frame.key}>
      <p className="text-muted-foreground text-xs font-medium">{frame.label}</p>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className={`h-auto max-h-[42rem] w-full ${inset ? 'bg-muted/30 rounded-md' : ''}`}
        role="img"
        aria-label={inset ? `${ariaLabel}: ${frame.label}` : ariaLabel}
      >
        {isHatched.size ? (
          <defs>
            <pattern
              id={hatchId}
              width="4"
              height="4"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect width="4" height="4" fill="var(--muted)" />
              <line
                x1="0"
                y1="0"
                x2="0"
                y2="4"
                stroke="var(--muted-foreground)"
                strokeWidth="1.2"
                strokeOpacity="0.45"
              />
            </pattern>
          </defs>
        ) : null}
        {codes.map((code) => (
          <path
            key={code}
            d={frame.paths[code]}
            data-code={code}
            data-hatched={isHatched.has(code) ? '' : undefined}
            fill={
              isHatched.has(code)
                ? `url(#${hatchId})`
                : fills[code] || 'var(--muted)'
            }
            stroke="var(--background)"
            strokeWidth={0.75}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            tabIndex={focusable ? 0 : -1}
            aria-label={focusable ? describe(code).title : undefined}
            className="hover:opacity-80 focus-visible:opacity-80 focus-visible:outline-none"
            {...tipHandlersFor(tip, () => describe(code))}
          />
        ))}
        {ring && frame.paths[ring] ? (
          <path
            d={frame.paths[ring]}
            data-ring={ring}
            fill="none"
            stroke="var(--foreground)"
            strokeWidth={2.5}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        ) : null}
      </svg>
    </div>
  )
}
