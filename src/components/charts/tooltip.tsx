// One tooltip for every chart and data row: hover and keyboard focus show
// the same { title, lines }, so nothing is reachable by pointer only. The
// provider renders a single fixed box; elements opt in with useTipHandlers.
import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type PointerEvent,
  type ReactNode,
} from 'react'

export type TipLine = { label: string; value: string; color?: string }
export type TipContent = { title: string; lines: TipLine[] }

type TipState = TipContent & { x: number; y: number }

type TipApi = {
  show: (content: TipContent, x: number, y: number) => void
  hide: () => void
}

const TipContext = createContext<TipApi>({ show: () => {}, hide: () => {} })

export function TipProvider({ children }: { children: ReactNode }) {
  const [tip, setTip] = useState<TipState | null>(null)
  const node = useRef<HTMLDivElement>(null)
  const api = useMemo<TipApi>(
    () => ({
      show: (content, x, y) => setTip({ ...content, x, y }),
      hide: () => setTip(null),
    }),
    [],
  )
  // Place after render, once the box has a size, so it never leaves the viewport.
  useLayoutEffect(() => {
    const el = node.current
    if (!el || !tip) return
    const w = el.offsetWidth
    const h = el.offsetHeight
    el.style.left = `${Math.max(8, Math.min(tip.x + 14, window.innerWidth - w - 8))}px`
    el.style.top = `${tip.y + 16 + h > window.innerHeight ? Math.max(8, tip.y - h - 12) : tip.y + 16}px`
  }, [tip])
  return (
    <TipContext.Provider value={api}>
      {children}
      {tip ? (
        <div
          ref={node}
          role="status"
          className="bg-popover text-popover-foreground pointer-events-none fixed z-50 max-w-xs rounded-md border px-3 py-2 text-xs shadow-md"
        >
          <div className="mb-1 font-medium">{tip.title}</div>
          {tip.lines.map((line, i) => (
            <div key={i} className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground flex items-center gap-1.5">
                {line.color ? (
                  <i
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ background: line.color }}
                  />
                ) : null}
                {line.label}
              </span>
              <b className="nums font-medium">{line.value}</b>
            </div>
          ))}
        </div>
      ) : null}
    </TipContext.Provider>
  )
}

export function useTip(): TipApi {
  return useContext(TipContext)
}

/** Pointer and focus handlers that show describe() in the shared tooltip. */
export function useTipHandlers(describe: () => TipContent) {
  const tip = useTip()
  const onPointerMove = useCallback(
    (e: PointerEvent) => tip.show(describe(), e.clientX, e.clientY),
    [tip, describe],
  )
  const onFocus = useCallback(
    (e: FocusEvent) => {
      const box = (e.currentTarget as Element).getBoundingClientRect()
      tip.show(describe(), box.left + box.width / 2, box.top)
    },
    [tip, describe],
  )
  const hide = tip.hide
  return { onPointerMove, onPointerLeave: hide, onFocus, onBlur: hide }
}

/** The same handlers for a list of targets without a hook per row. */
export function tipHandlersFor(tip: TipApi, describe: () => TipContent) {
  return {
    onPointerMove: (e: PointerEvent) =>
      tip.show(describe(), e.clientX, e.clientY),
    onPointerLeave: tip.hide,
    onFocus: (e: FocusEvent) => {
      const box = (e.currentTarget as Element).getBoundingClientRect()
      tip.show(describe(), box.left + box.width / 2, box.top)
    },
    onBlur: tip.hide,
  }
}
