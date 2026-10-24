import { readFileSync } from 'node:fs'
import path from 'node:path'
import { inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'

const ICON = path.resolve(
  import.meta.dirname,
  '../../public/apple-touch-icon.png',
)

/** Decodes an 8-bit, non-interlaced PNG into its header and raw pixels. */
function decode(png: Buffer) {
  const width = png.readUInt32BE(16)
  const height = png.readUInt32BE(20)
  const colorType = png[25]
  const idat: Buffer[] = []
  for (let at = 8; at < png.length;) {
    const length = png.readUInt32BE(at)
    if (png.toString('ascii', at + 4, at + 8) === 'IDAT')
      idat.push(png.subarray(at + 8, at + 8 + length))
    at += length + 12
  }
  const data = inflateSync(Buffer.concat(idat))
  const bpp = colorType === 6 ? 4 : 3
  const stride = width * bpp
  const pixels = Buffer.alloc(height * stride)
  for (let y = 0; y < height; y++) {
    const filter = data[y * (stride + 1)]
    for (let x = 0; x < stride; x++) {
      const raw = data[y * (stride + 1) + 1 + x]
      const a = x >= bpp ? pixels[y * stride + x - bpp] : 0
      const b = y > 0 ? pixels[(y - 1) * stride + x] : 0
      const c = x >= bpp && y > 0 ? pixels[(y - 1) * stride + x - bpp] : 0
      const p = a + b - c
      const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)]
      const predict = [
        0,
        a,
        b,
        (a + b) >> 1,
        pa <= pb && pa <= pc ? a : pb <= pc ? b : c,
      ][filter]
      pixels[y * stride + x] = (raw + predict) & 0xff
    }
  }
  const alpha = (x: number, y: number) =>
    bpp === 4 ? pixels[y * stride + x * bpp + 3] : 255
  return { width, height, colorType, alpha }
}

describe('apple-touch-icon.png', () => {
  const { width, height, colorType, alpha } = decode(readFileSync(ICON))

  it('is a 180px RGBA square', () => {
    expect([width, height, colorType]).toEqual([180, 180, 6])
  })

  it('leaves the rounded corners transparent', () => {
    for (const [x, y] of [
      [0, 0],
      [179, 0],
      [0, 179],
      [179, 179],
    ])
      expect(alpha(x, y)).toBe(0)
  })

  it('keeps the icon itself opaque', () => {
    expect(alpha(90, 90)).toBe(255)
    expect(alpha(90, 0)).toBe(255)
  })
})
