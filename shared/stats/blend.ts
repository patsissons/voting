// How much of each choice's colour goes into a division's fill on the results
// maps. Plain vote shares make a muddy average of every party (orange and blue
// at 45/40 is mauve), so the shares are cubed, which pulls the leader ahead
// of the pack, and a sole leader always holds at least LEADER of the mix: its
// colour reads first, and a close second only tints it.

export const LEADER = 0.75
const SHARPEN = 3

export type Weight = { key: string; w: number }

/** Colour weights summing to 1, heaviest first; [] when nothing is counted. */
export function blendWeights(
  shares: { key: string; share: number }[],
): Weight[] {
  const live = shares.filter((s) => s.share > 0)
  const total = live.reduce((sum, s) => sum + Math.pow(s.share, SHARPEN), 0)
  if (!total) return []
  const out = live
    .map((s) => ({ key: s.key, w: Math.pow(s.share, SHARPEN) / total }))
    .sort((a, b) => b.w - a.w)
  const [lead, next] = out
  if (lead.w < LEADER && (!next || next.w < lead.w)) {
    const scale = (1 - LEADER) / (1 - lead.w)
    for (const o of out) o.w = o === lead ? LEADER : o.w * scale
  }
  return out
}
