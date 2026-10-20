import { useLayoutEffect, useRef, useState } from 'react'

/** A container's width, kept current with a ResizeObserver; 0 until mounted. */
export function useMeasure<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const read = () => {
      const next = Math.floor(el.clientWidth)
      if (next) setWidth(next)
    }
    read()
    const observer = new ResizeObserver(read)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return { ref, width }
}

/** Nice axis ticks from 0 to at least max. */
export function niceTicks(max: number, count = 4): number[] {
  if (!(max > 0)) return [0, 10]
  const rough = max / count
  const power = Math.pow(10, Math.floor(Math.log10(rough)))
  const step =
    [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= rough) ||
    power * 10
  const ticks: number[] = []
  for (let v = 0; v < max + step; v += step) ticks.push(+v.toFixed(6))
  return ticks
}
