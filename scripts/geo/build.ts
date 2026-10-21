/**
 * Builds the boundary sets the results maps draw: src/geo/<set>.json, one
 * province frame plus city insets, each a viewBox and one SVG path per
 * electoral division keyed by the code the results use. Generated and
 * committed; never edit the output by hand.
 *
 *   pnpm geo            build every set (sources cached in .geo-cache/)
 *   pnpm geo --refresh  download the sources again first
 *
 * Projected coordinates go straight to the page: Alberta keeps the
 * shapefile's 10TM, BC is requested in BC Albers (EPSG:3005). BC's districts
 * run out to sea, so they are clipped to its land first. mapshaper simplifies
 * each frame at its own resolution, keeping shared borders shared.
 */
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import mapshaper from 'mapshaper'
import type { BoundarySet, Frame } from '../../shared/geo.ts'
import { toPath } from './paths.ts'

const ROOT = path.resolve(import.meta.dirname, '../..')
const CACHE = path.join(ROOT, '.geo-cache')
const OUT = path.join(ROOT, 'src/geo')
/** Every frame is this many units wide; heights follow the frame's shape. */
const WIDTH = 1000
/** Room around an inset's own divisions, as a share of its larger side. */
const PAD = 0.04

type FrameSpec = {
  key: string
  label: string
  /** Simplification interval in metres. */
  interval: number
  /** Islands smaller than this many square kilometres are left out. */
  minIsland: number
  /** The divisions the frame is sized to; every division when absent. */
  codes?: (code: string) => boolean
}

type SetSpec = {
  key: string
  attribution: string
  source: string
  /** The cached download's file name; mapshaper reads it by extension. */
  file: string
  /** A mapshaper -each expression that sets `code`. */
  code: string
  /** Land polygons to clip the divisions to, and the -filter that picks them. */
  land?: { source: string; file: string; filter: string }
  frames: FrameSpec[]
}

const between = (lo: number, hi: number) => (code: string) =>
  Number(code) >= lo && Number(code) <= hi
const among = (codes: string) => {
  const set = new Set(codes.split(' '))
  return (code: string) => set.has(code)
}

const SETS: SetSpec[] = [
  {
    key: 'ab-2017',
    attribution:
      'Boundaries: Elections Alberta, the 87 electoral divisions of 2017 (Open Government Licence – Alberta).',
    source:
      'https://www.elections.ab.ca/uploads/2019Boundaries_ED-Shapefiles.zip',
    file: 'ab-2017.zip',
    code: "code = String(EDNumber20).padStart(2, '0')",
    frames: [
      { key: 'province', label: 'Alberta', interval: 400, minIsland: 0 },
      {
        key: 'calgary',
        label: 'Calgary',
        interval: 25,
        minIsland: 0,
        codes: between(1, 26),
      },
      {
        key: 'edmonton',
        label: 'Edmonton',
        interval: 25,
        minIsland: 0,
        codes: between(27, 46),
      },
    ],
  },
  {
    key: 'bc-2023',
    attribution:
      'Boundaries: Elections BC via the BC Data Catalogue, the 93 electoral districts of 2023 (Open Government Licence – British Columbia).',
    source:
      'https://openmaps.gov.bc.ca/geo/pub/wfs?service=WFS&version=2.0.0&request=GetFeature&typeName=WHSE_ADMIN_BOUNDARIES.EBC_PROV_ELECTORAL_DIST_SVW&outputFormat=json&srsName=EPSG:3005&propertyName=ED_ABBREVIATION,SHAPE',
    file: 'bc-2023.json',
    code: 'code = ED_ABBREVIATION',
    // The 1:250,000 coastline: the mainland and the islands, not the sea tiles.
    land: {
      source:
        'https://openmaps.gov.bc.ca/geo/pub/wfs?service=WFS&version=2.0.0&request=GetFeature&typeName=WHSE_BASEMAPPING.NTS_BC_COASTLINE_POLYS_125M&outputFormat=json&srsName=EPSG:3005&propertyName=FCODE,GEOMETRY',
      file: 'bc-land.json',
      filter: "FCODE == 'HB15335000' || FCODE == 'GE14850000'",
    },
    frames: [
      {
        key: 'province',
        label: 'British Columbia',
        interval: 800,
        minIsland: 40,
      },
      // Sized to the urban ridings; the mountain ridings of the North Shore
      // and the Fraser Valley run past the frame's edge.
      {
        key: 'metro',
        label: 'Metro Vancouver',
        interval: 40,
        minIsland: 0.5,
        codes: among(
          'BNC BNE BNN BNO BNS CQM DLN DLS LWG LWI NMC NVL POC POM RCB RCC RCQ RCS SRC SRD SRF SRG SRN SUN SUP SUR SUS SWR VFV VHA VKE VLA VLM VNP VNQ VNR VNS VNT VNW VNY',
        ),
      },
      {
        key: 'capital',
        label: 'Greater Victoria',
        interval: 25,
        minIsland: 0.2,
        codes: among('VTB VTS OBG SAS ESC'),
      },
    ],
  },
]

type Geometry =
  | { type: 'Polygon'; coordinates: number[][][] }
  | { type: 'MultiPolygon'; coordinates: number[][][][] }
type Feature = { properties: { code: string }; geometry: Geometry | null }
type Collection = { features: Feature[] }

const polygons = (g: Geometry | null): number[][][][] =>
  !g ? [] : g.type === 'Polygon' ? [g.coordinates] : g.coordinates

async function run(
  commands: string,
  input: Record<string, unknown>,
): Promise<Collection> {
  const out = await mapshaper.applyCommands(commands, input)
  const text = out['out.json']
  if (!text) throw new Error(`mapshaper wrote nothing for: ${commands}`)
  return JSON.parse(String(text)) as Collection
}

async function cached(
  url: string,
  name: string,
  refresh: boolean,
): Promise<Buffer> {
  const file = path.join(CACHE, name)
  if (refresh || !existsSync(file)) {
    console.log(`[geo] downloading ${url}`)
    const res = await fetch(url)
    if (!res.ok) throw new Error(`${url}: ${res.status}`)
    await mkdir(CACHE, { recursive: true })
    await writeFile(file, Buffer.from(await res.arrayBuffer()))
  }
  return readFile(file)
}

/** The bounding box [xmin, ymin, xmax, ymax] of the matching features. */
function bounds(features: Feature[], keep: (code: string) => boolean) {
  const box = [Infinity, Infinity, -Infinity, -Infinity]
  for (const f of features) {
    if (!keep(f.properties.code)) continue
    for (const poly of polygons(f.geometry))
      for (const ring of poly)
        for (const [x, y] of ring) {
          box[0] = Math.min(box[0], x)
          box[1] = Math.min(box[1], y)
          box[2] = Math.max(box[2], x)
          box[3] = Math.max(box[3], y)
        }
  }
  return box
}

async function build(spec: SetSpec, refresh: boolean): Promise<BoundarySet> {
  const input: Record<string, unknown> = {
    [spec.file]: await cached(spec.source, spec.file, refresh),
  }
  let clip = ''
  if (spec.land) {
    input[spec.land.file] = await cached(
      spec.land.source,
      spec.land.file,
      refresh,
    )
    clip = ` -i ${spec.land.file} name=land -filter "${spec.land.filter}" target=land -clip land target=ed`
  }
  const full = await run(
    `-i ${spec.file} name=ed${clip} -each "${spec.code}" target=ed -filter-fields code target=ed -o out.json format=geojson target=ed`,
    input,
  )
  const frames: Frame[] = []
  for (const fs of spec.frames) {
    let box = bounds(full.features, fs.codes || (() => true))
    if (fs.codes) {
      const pad = Math.max(box[2] - box[0], box[3] - box[1]) * PAD
      box = [box[0] - pad, box[1] - pad, box[2] + pad, box[3] + pad]
    }
    const islands = fs.minIsland
      ? ` -filter-islands min-area=${fs.minIsland * 1e6}`
      : ''
    const bbox = fs.codes ? ` -clip bbox=${box.join(',')} remove-slivers` : ''
    const simple = await run(
      `-i in.json${islands} -simplify interval=${fs.interval} keep-shapes${bbox} -o out.json format=geojson`,
      { 'in.json': full },
    )
    const scale = WIDTH / (box[2] - box[0])
    const height = Math.round((box[3] - box[1]) * scale)
    const paths: Record<string, string> = {}
    for (const f of simple.features) {
      const d = toPath(polygons(f.geometry), (x, y) => [
        Math.round((x - box[0]) * scale),
        Math.round((box[3] - y) * scale),
      ])
      if (d) paths[f.properties.code] = d
    }
    const sorted = Object.fromEntries(
      Object.entries(paths).sort(([a], [b]) => a.localeCompare(b)),
    )
    frames.push({
      key: fs.key,
      label: fs.label,
      viewBox: [WIDTH, height],
      paths: sorted,
    })
    console.log(
      `[geo] ${spec.key}/${fs.key}: ${Object.keys(sorted).length} divisions, ${WIDTH}x${height}`,
    )
  }
  return { key: spec.key, attribution: spec.attribution, frames }
}

const refresh = process.argv.includes('--refresh')
await mkdir(OUT, { recursive: true })
for (const spec of SETS) {
  const set = await build(spec, refresh)
  // One frame per line keeps diffs readable without bloating the file.
  const text = `{"key":${JSON.stringify(set.key)},"attribution":${JSON.stringify(set.attribution)},"frames":[\n${set.frames.map((f) => JSON.stringify(f)).join(',\n')}\n]}\n`
  const file = path.join(OUT, `${spec.key}.json`)
  await writeFile(file, text)
  console.log(
    `[geo] wrote ${path.relative(ROOT, file)} (${Math.round(text.length / 1024)} KB)`,
  )
}
