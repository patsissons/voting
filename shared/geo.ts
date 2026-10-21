// The boundary-set file the results maps draw (src/geo/<set>.json), written
// by scripts/geo/build.ts: projected frames, one SVG path per division code.

export type Frame = {
  key: string
  label: string
  /** [width, height] of the frame's viewBox, from 0,0. */
  viewBox: [number, number]
  /** One SVG path per division code. */
  paths: Record<string, string>
}

export type BoundarySet = {
  key: string
  attribution: string
  /** The province first, then its city insets. */
  frames: Frame[]
}
