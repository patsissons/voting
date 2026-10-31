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
 * shapefile's 10TM, BC is requested in BC Albers (EPSG:3005), and the Census
 * files for the US (long/lat) are projected here with mapshaper's Albers USA,
 * which tucks Alaska and Hawaii under the lower 48. A set's inputs are merged
 * into one layer (the Census publishes the 2026 districts one state at a
 * time). BC's districts run out to sea and the TIGER/Line districts run into
 * the lakes and the territorial sea, so both are clipped to land first.
 * mapshaper simplifies each frame at its own resolution, keeping shared
 * borders shared; a full-resolution source gets one coarse pass first.
 *
 * Frame 0 is always keyed `province`: the whole area, whatever the
 * jurisdiction calls itself. The insets follow.
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

/** A download: its URL and the cached file's name (mapshaper reads it by extension). */
type Input = { source: string; file: string }

type SetSpec = {
  key: string
  attribution: string
  /** The source files, merged into one layer of divisions. */
  inputs: Input[]
  /** A first simplification of the merged input in metres, for full-resolution sources. */
  presimplify?: number
  /** A mapshaper -each expression that sets `code`. */
  code: string
  /** A mapshaper -filter expression that keeps the divisions wanted. */
  filter?: string
  /** A mapshaper -proj argument for a source in long/lat ("albersusa"). */
  proj?: string
  /** Land polygons to clip the divisions to, and the -filter that picks them. */
  land?: Input & { filter: string }
  frames: FrameSpec[]
}

/** State FIPS codes to postal codes, for the Census district file. */
const FIPS_POSTAL: Record<string, string> = {
  '01': 'AL',
  '02': 'AK',
  '04': 'AZ',
  '05': 'AR',
  '06': 'CA',
  '08': 'CO',
  '09': 'CT',
  '10': 'DE',
  '12': 'FL',
  '13': 'GA',
  '15': 'HI',
  '16': 'ID',
  '17': 'IL',
  '18': 'IN',
  '19': 'IA',
  '20': 'KS',
  '21': 'KY',
  '22': 'LA',
  '23': 'ME',
  '24': 'MD',
  '25': 'MA',
  '26': 'MI',
  '27': 'MN',
  '28': 'MS',
  '29': 'MO',
  '30': 'MT',
  '31': 'NE',
  '32': 'NV',
  '33': 'NH',
  '34': 'NJ',
  '35': 'NM',
  '36': 'NY',
  '37': 'NC',
  '38': 'ND',
  '39': 'OH',
  '40': 'OK',
  '41': 'OR',
  '42': 'PA',
  '44': 'RI',
  '45': 'SC',
  '46': 'SD',
  '47': 'TN',
  '48': 'TX',
  '49': 'UT',
  '50': 'VT',
  '51': 'VA',
  '53': 'WA',
  '54': 'WV',
  '55': 'WI',
  '56': 'WY',
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
    inputs: [
      {
        source:
          'https://www.elections.ab.ca/uploads/2019Boundaries_ED-Shapefiles.zip',
        file: 'ab-2017.zip',
      },
    ],
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
    inputs: [
      {
        source:
          'https://openmaps.gov.bc.ca/geo/pub/wfs?service=WFS&version=2.0.0&request=GetFeature&typeName=WHSE_ADMIN_BOUNDARIES.EBC_PROV_ELECTORAL_DIST_SVW&outputFormat=json&srsName=EPSG:3005&propertyName=ED_ABBREVIATION,SHAPE',
        file: 'bc-2023.json',
      },
    ],
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
  {
    key: 'us-state',
    attribution:
      'Boundaries: US Census Bureau cartographic boundary files, 2024 states (public domain; no licence needed).',
    inputs: [
      {
        source:
          'https://www2.census.gov/geo/tiger/GENZ2024/shp/cb_2024_us_state_20m.zip',
        file: 'us-state.zip',
      },
    ],
    filter: "STUSPS != 'PR' && STUSPS != 'DC'",
    proj: 'albersusa',
    code: 'code = STUSPS.toLowerCase()',
    frames: [
      {
        key: 'province',
        label: 'United States',
        interval: 3000,
        minIsland: 50,
      },
      {
        key: 'northeast',
        label: 'Northeast',
        interval: 600,
        minIsland: 5,
        codes: among('ct de ma md nh nj ri vt'),
      },
    ],
  },
  {
    key: 'us-cd119',
    attribution:
      'Boundaries: US Census Bureau cartographic boundary files, the 435 districts of the 119th Congress (public domain; no licence needed).',
    inputs: [
      {
        source:
          'https://www2.census.gov/geo/tiger/GENZ2024/shp/cb_2024_us_cd119_500k.zip',
        file: 'us-cd119.zip',
      },
    ],
    // 98 and ZZ are the non-voting delegates and the undefined areas.
    filter: "CD119FP != '98' && CD119FP != 'ZZ'",
    proj: 'albersusa',
    // The expression travels inside double quotes, so the table uses single ones.
    code: `code = ({${Object.entries(FIPS_POSTAL)
      .map(([k, v]) => `'${k}':'${v}'`)
      .join(
        ',',
      )}})[STATEFP].toLowerCase() + '-' + (CD119FP === '00' ? 'al' : CD119FP)`,
    frames: [
      {
        key: 'province',
        label: 'United States',
        interval: 3000,
        minIsland: 50,
      },
      {
        key: 'nyc',
        label: 'New York City and northern New Jersey',
        interval: 150,
        minIsland: 0.5,
        codes: among(
          'ny-03 ny-04 ny-05 ny-06 ny-07 ny-08 ny-09 ny-10 ny-11 ny-12 ny-13 ny-14 ny-15 ny-16 nj-05 nj-06 nj-07 nj-08 nj-09 nj-10 nj-11',
        ),
      },
      {
        key: 'la',
        label: 'Los Angeles',
        interval: 200,
        minIsland: 1,
        codes: among(
          'ca-27 ca-28 ca-29 ca-30 ca-31 ca-32 ca-34 ca-35 ca-36 ca-37 ca-38 ca-42 ca-43 ca-44 ca-45 ca-46 ca-47',
        ),
      },
      {
        key: 'bay',
        label: 'San Francisco Bay',
        interval: 200,
        minIsland: 1,
        codes: among('ca-08 ca-10 ca-11 ca-12 ca-14 ca-15 ca-16 ca-17'),
      },
      {
        key: 'chicago',
        label: 'Chicago',
        interval: 200,
        minIsland: 1,
        codes: among(
          'il-01 il-02 il-03 il-04 il-05 il-06 il-07 il-08 il-09 il-10 il-11',
        ),
      },
      {
        key: 'dc',
        label: 'Washington and Baltimore',
        interval: 200,
        minIsland: 1,
        codes: among('md-02 md-03 md-04 md-05 md-07 md-08 va-08 va-10 va-11'),
      },
      {
        key: 'sfl',
        label: 'South Florida',
        interval: 200,
        minIsland: 1,
        codes: among('fl-20 fl-22 fl-23 fl-24 fl-25 fl-26 fl-27 fl-28'),
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
  const input: Record<string, unknown> = {}
  for (const i of spec.inputs)
    input[i.file] = await cached(i.source, i.file, refresh)
  const files = spec.inputs.map((i) => i.file).join(' ')
  // Several inputs import together (shared topology) and merge into one layer.
  const open =
    spec.inputs.length > 1
      ? `-i ${files} combine-files -merge-layers force name=ed`
      : `-i ${files} name=ed`
  const filter = spec.filter ? ` -filter "${spec.filter}" target=ed` : ''
  const pre = spec.presimplify
    ? ` -simplify interval=${spec.presimplify} keep-shapes target=ed`
    : ''
  let clip = ''
  if (spec.land) {
    input[spec.land.file] = await cached(
      spec.land.source,
      spec.land.file,
      refresh,
    )
    clip = ` -i ${spec.land.file} name=land -filter "${spec.land.filter}" target=land -clip land target=ed`
  }
  const proj = spec.proj ? ` -proj ${spec.proj} target=ed` : ''
  const full = await run(
    `${open}${filter}${pre}${clip}${proj} -each "${spec.code}" target=ed -filter-fields code target=ed -o out.json format=geojson target=ed`,
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
