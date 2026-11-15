/**
 * "Draw your own region": NASA POWER regional downloads, analysed in the browser exactly the way
 * pipeline/build.py builds the featured regions.
 *
 *   1. Land mask: MERRA-2 cells where root-zone soil wetness (GWETROOT) exists in more than 90% of months
 *      (1981 to the end year). A coarser grid cell (CERES, 1 degree) is land when at least half of the
 *      MERRA-2 cells inside it are land.
 *   2. Regional series: cos(latitude) area-weighted mean of the land cells, rounded like the published series.
 *   3. The same statistics as every other result (src/lib/stats.ts, via analyzeSeries).
 *   4. Per-cell trend map: Mann-Kendall + Theil-Sen in each land cell with at least 90% of months,
 *      Benjamini-Hochberg false-discovery control across cells.
 *
 * POWER's regional endpoint takes one parameter per request and a box 2 to 10 degrees on each side
 * (checked with real requests: it answers 422 with "Please provide at least a 2 degree range in latitude",
 * "Please provide a maximum of 10 degree range in longitude", "A maximum of 1 parameters ..."). It sends
 * Access-Control-Allow-Origin: * and a Content-Length but no compression, so a full 10 x 10 degree box
 * is about 3 MB per MERRA-2 variable. src/lib/regional.test.ts checks every step against the pipeline
 * on a recorded POWER response.
 */
import * as dataModule from './data'
import { LIVE_VARIABLES } from './data'
import { decimalsFor, fmt, fmtP } from './format'
import { bhFdr, mannKendall, senSlope, type Analysis } from './stats'
import type { Catalog, MapJSON, SeriesJSON } from './types'

/** [lat_min, lat_max, lon_min, lon_max], the same order as catalog.json bboxes. */
export type Box = [number, number, number, number]

export const POWER_REGIONAL = 'https://power.larc.nasa.gov/api/temporal/monthly/regional'
export const MIN_SPAN = 2
export const MAX_SPAN = 10
export const MASK_PARAM = 'GWETROOT'
/** pipeline/build.py takes the land mask from GWETROOT over 1981 to the end year. */
export const MASK_START = 1981
const FILL = -999
const LAND_SHARE = 0.9
const CELL_COVERAGE = 0.9
const MIN_YEARS = 15
const MERRA_DLAT = 0.5
const MERRA_DLON = 0.625
const EARTH_KM = 6371.0088
/** POWER JSON costs about 16.3 bytes per monthly value (measured on 10 x 10 and 4 x 10 degree responses). */
const BYTES_PER_VALUE = 16.3

// ------------------------------------------------------------------ variables

/** POWER codes of the live variables (pipeline/config.py), used while data.ts keeps its own map private. */
const KNOWN_CODES: Record<string, string> = {
  t2m: 'T2M',
  tmax: 'T2M_MAX',
  precip: 'PRECTOTCORR',
  soil: 'GWETROOT',
  evap: 'EVLAND',
  humidity: 'RH2M',
  aod: 'AOD_55_ADJ',
  sun: 'ALLSKY_SFC_SW_DWN',
  cloud: 'CLOUD_AMT',
  wind: 'WS2M',
}

/**
 * POWER parameter code for every live-mode variable (LIVE_VARIABLES in data.ts). If data.ts exports its
 * POWER_PARAMS map, that map wins, so variables added there come through here with no other change.
 */
export function powerCodes(): Record<string, string> {
  const shared = (dataModule as unknown as Record<string, unknown>)['POWER_PARAMS']
  const fromData = shared && typeof shared === 'object' ? (shared as Record<string, unknown>) : {}
  const out: Record<string, string> = {}
  for (const vid of LIVE_VARIABLES) {
    const code = typeof fromData[vid] === 'string' ? (fromData[vid] as string) : KNOWN_CODES[vid]
    if (code) out[vid] = code
  }
  return out
}

export interface RegionVariable {
  vid: string
  code: string
  start: number
}

/** Monthly POWER variables that a drawn region can show, in catalog order. */
export function regionVariables(cat: Catalog): RegionVariable[] {
  const codes = powerCodes()
  return Object.keys(cat.variables)
    .filter((vid) => codes[vid])
    .map((vid) => ({ vid, code: codes[vid], start: cat.variables[vid].start }))
}

// ------------------------------------------------------------------ boxes

const r2 = (v: number) => Math.round(v * 100) / 100 + 0 // + 0 turns -0 into 0

function fitSpan(lo: number, hi: number, wlo: number, whi: number): [number, number] {
  if (lo > hi) [lo, hi] = [hi, lo]
  let a = r2(lo)
  let b = r2(hi)
  if (b - a < MIN_SPAN - 1e-9 || b - a > MAX_SPAN + 1e-9) {
    // grow or shrink around the centre
    const span = b - a < MIN_SPAN ? MIN_SPAN : MAX_SPAN
    a = r2((lo + hi) / 2 - span / 2)
    b = r2(a + span)
  }
  if (a < wlo) [a, b] = [wlo, r2(b + wlo - a)]
  if (b > whi) [a, b] = [r2(a - (b - whi)), whi]
  return [a, b]
}

/**
 * The box NASA POWER will accept: corners in order and rounded to 0.01 degree, 2 to 10 degrees on each side (grown or
 * shrunk around its centre when outside that), inside -90..90 and -180..180 (a POWER box cannot cross the 180th meridian).
 */
export function clampBox(b: Box): Box {
  const shift = Math.floor(((b[2] + b[3]) / 2 + 180) / 360) * 360
  const [a0, a1] = fitSpan(b[0], b[1], -90, 90)
  const [o0, o1] = fitSpan(b[2] - shift, b[3] - shift, -180, 180)
  return [a0, a1, o0, o1]
}

/** Read "lat0,lat1,lon0,lon1" from a URL. */
export function parseBox(s: string | null | undefined): Box | null {
  if (!s) return null
  const v = s.split(',').map((x) => (x.trim() === '' ? NaN : Number(x)))
  if (v.length !== 4 || !v.every(Number.isFinite)) return null
  return v as Box
}

export const formatBox = (b: Box) => b.map((v) => String(r2(v))).join(',')

export const sameBox = (a: Box, b: Box) => a.every((v, i) => Math.abs(v - b[i]) < 1e-6)

/** The featured region whose catalog bbox is exactly this box, if any. */
export function featuredMatch(cat: Catalog, b: Box): string | undefined {
  return Object.entries(cat.regions).find(([, r]) => sameBox(r.bbox, b))?.[0]
}

function span(lo: number, hi: number, pos: string, neg: string): string {
  const a = Math.abs(r2(lo))
  const b = Math.abs(r2(hi))
  if (lo >= 0) return `${a}°–${b}°${hi > 0 ? pos : ''}`
  if (hi <= 0) return `${a}°–${b}°${neg}`
  return `${a}°${neg}–${b}°${pos}`
}

/** "24°–28°N, 77°–87°E", "14°–6°S, 60°–50°W", "2°S–3°N, 5°W–5°E". */
export function boxLabel(b: Box): string {
  return `${span(b[0], b[1], 'N', 'S')}, ${span(b[2], b[3], 'E', 'W')}`
}

/** Side lengths in degrees and kilometres, and the area of the box on the sphere. */
export function boxSize(b: Box): { dLat: number; dLon: number; kmNS: number; kmEW: number; km2: number } {
  const rad = Math.PI / 180
  const dLat = r2(b[1] - b[0])
  const dLon = r2(b[3] - b[2])
  const kmNS = EARTH_KM * dLat * rad
  const kmEW = EARTH_KM * dLon * rad * Math.cos(((b[0] + b[1]) / 2) * rad)
  const km2 = EARTH_KM * EARTH_KM * dLon * rad * Math.abs(Math.sin(b[1] * rad) - Math.sin(b[0] * rad))
  return { dLat, dLon, kmNS, kmEW, km2 }
}

/** How many grid cells POWER returns for the box: MERRA-2 (0.5 x 0.625 degrees) or CERES (1 degree, centred on .5). */
export function estimateCells(b: Box, grid: 'merra2' | 'ceres' = 'merra2'): number {
  const n = (lo: number, hi: number, d: number, off: number) => Math.max(0, Math.floor((hi - off) / d + 1e-9) - Math.ceil((lo - off) / d - 1e-9) + 1)
  return grid === 'merra2' ? n(b[0], b[1], MERRA_DLAT, 0) * n(b[2], b[3], MERRA_DLON, 0) : n(b[0], b[1], 1, 0.5) * n(b[2], b[3], 1, 0.5)
}

/** Approximate size of one POWER response for the box (CERES products, which start in 2001, sit on a 1 degree grid). */
export function estimateBytes(b: Box, start: number, end: number): number {
  return estimateCells(b, start >= 2001 ? 'ceres' : 'merra2') * (end - start + 1) * 12 * BYTES_PER_VALUE
}

/** Requests and approximate bytes to download a box: the land mask plus one request per distinct parameter. */
export function estimateDownload(cat: Catalog, b: Box): { requests: number; bytes: number } {
  const seen = new Set<string>([`${MASK_PARAM}:${MASK_START}`])
  let bytes = estimateBytes(b, MASK_START, cat.end_year)
  for (const v of regionVariables(cat)) {
    const key = `${v.code}:${v.start}`
    if (seen.has(key)) continue
    seen.add(key)
    bytes += estimateBytes(b, v.start, cat.end_year)
  }
  return { requests: seen.size, bytes }
}

// ------------------------------------------------------------------ parsing and analysis (pure)

export interface PowerGrid {
  param: string
  start: number
  end: number
  lat: number[]
  lon: number[]
  /** elevation of each cell in metres, as POWER reports it */
  elev: number[]
  /** values[cell][month], month 0 = January of `start`; NaN where POWER has no data */
  values: number[][]
}

export function monthKeys(start: number, end: number): string[] {
  const out: string[] = []
  for (let y = start; y <= end; y++) for (let m = 1; m <= 12; m++) out.push(`${y}${String(m).padStart(2, '0')}`)
  return out
}

type Feature = { geometry?: { coordinates?: number[] }; properties?: { parameter?: Record<string, Record<string, unknown>> } }

/** A POWER monthly/regional JSON response as a grid (port of pipeline/power.py regional()). */
export function parseRegional(raw: unknown, param: string, start: number, end: number): PowerGrid {
  const feats = (raw as { features?: unknown })?.features
  if (!Array.isArray(feats)) throw new Error('NASA POWER sent an answer without grid cells.')
  const keys = monthKeys(start, end)
  const grid: PowerGrid = { param, start, end, lat: [], lon: [], elev: [], values: [] }
  for (const f of feats as Feature[]) {
    const c = f?.geometry?.coordinates
    if (!c || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) continue
    const s = f.properties?.parameter?.[param] ?? {}
    grid.lon.push(c[0])
    grid.lat.push(c[1])
    grid.elev.push(Number.isFinite(c[2]) ? c[2] : NaN)
    grid.values.push(keys.map((k) => (typeof s[k] === 'number' && (s[k] as number) > FILL + 1e-6 ? (s[k] as number) : NaN)))
  }
  return grid
}

function finiteShare(row: number[]): number {
  let n = 0
  for (const v of row) if (Number.isFinite(v)) n++
  return row.length ? n / row.length : 0
}

/** Land cells of a GWETROOT grid: soil wetness present in more than 90% of months. */
export function landCells(maskGrid: PowerGrid): boolean[] {
  return maskGrid.values.map((row) => finiteShare(row) > LAND_SHARE)
}

function step(values: number[], fallback: number): number {
  const u = [...new Set(values)].sort((a, b) => a - b)
  let d = Infinity
  for (let i = 1; i < u.length; i++) d = Math.min(d, u[i] - u[i - 1])
  return Number.isFinite(d) ? d : fallback
}

/**
 * Land mask on any POWER grid (port of build.land_mask). On the MERRA-2 grid it is the GWETROOT mask itself;
 * a coarser cell is land when at least half of the MERRA-2 cells within half a cell of its centre are land.
 */
export function maskOn(grid: PowerGrid, maskGrid: PowerGrid, land: boolean[]): { mask: boolean[]; dlat: number; dlon: number } {
  const dlat = step(grid.lat, MERRA_DLAT)
  const dlon = step(grid.lon, MERRA_DLON)
  if (Math.abs(dlat - MERRA_DLAT) < 1e-6 && Math.abs(dlon - MERRA_DLON) < 1e-6) {
    const at = new Map(maskGrid.lat.map((la, i) => [`${la},${maskGrid.lon[i]}`, land[i]]))
    return { mask: grid.lat.map((la, k) => at.get(`${la},${grid.lon[k]}`) ?? false), dlat, dlon }
  }
  const mask = grid.lat.map((la, k) => {
    const lo = grid.lon[k]
    let n = 0
    let nLand = 0
    maskGrid.lat.forEach((mla, i) => {
      if (Math.abs(mla - la) <= dlat / 2 && Math.abs(maskGrid.lon[i] - lo) <= dlon / 2) {
        n++
        if (land[i]) nLand++
      }
    })
    return n > 0 && nLand / n >= 0.5
  })
  return { mask, dlat, dlon }
}

/** cos(latitude) area-weighted mean of the masked cells, month by month (port of build.area_mean). */
export function areaMean(grid: PowerGrid, mask: boolean[]): number[] {
  const n = grid.values[0]?.length ?? 0
  const sum = new Float64Array(n)
  const tot = new Float64Array(n)
  grid.values.forEach((row, k) => {
    if (!mask[k]) return
    const w = Math.cos((grid.lat[k] * Math.PI) / 180)
    for (let i = 0; i < n; i++)
      if (Number.isFinite(row[i])) {
        sum[i] += row[i] * w
        tot[i] += w
      }
  })
  return Array.from(sum, (s, i) => (tot[i] > 0 ? s / tot[i] : NaN))
}

/** Round like Python's round(x, d) (they differ only on exact binary ties); NaN stays NaN. */
export function roundTo(v: number, d: number): number {
  return Number.isFinite(v) ? Number(v.toFixed(d)) : NaN
}

function axes(start: number, n: number): { years: number[]; months: number[] } {
  return { years: Array.from({ length: n }, (_, i) => start + Math.floor(i / 12)), months: Array.from({ length: n }, (_, i) => (i % 12) + 1) }
}

/**
 * numpy's float64 sum (pairwise_sum_DOUBLE: eight accumulators within a block of up to 128 values, halves above).
 * Grid cells with two-decimal values often have yearly means that are exactly equal in exact arithmetic; whether
 * such a pair then compares as tied, rising or falling depends on rounding, which moves the Mann-Kendall S. The
 * trend map therefore sums exactly as the pipeline does, so each cell's p-value matches it to the last digit.
 */
export function npSum(a: ArrayLike<number>, lo = 0, n = a.length - lo): number {
  if (n < 8) {
    let res = -0
    for (let i = 0; i < n; i++) res += a[lo + i]
    return res
  }
  if (n <= 128) {
    const r = [a[lo], a[lo + 1], a[lo + 2], a[lo + 3], a[lo + 4], a[lo + 5], a[lo + 6], a[lo + 7]]
    let i = 8
    for (; i < n - (n % 8); i += 8) for (let j = 0; j < 8; j++) r[j] += a[lo + i + j]
    let res = ((r[0] + r[1]) + (r[2] + r[3])) + ((r[4] + r[5]) + (r[6] + r[7]))
    for (; i < n; i++) res += a[lo + i]
    return res
  }
  let n2 = Math.floor(n / 2)
  n2 -= n2 % 8
  return npSum(a, lo, n2) + npSum(a, lo + n2, n - n2)
}

/** np.nanmean: missing values count as zero in the sum and are left out of the count. */
function npNanMean(values: number[]): number {
  let n = 0
  const z = values.map((v) => (Number.isFinite(v) ? (n++, v) : 0))
  return n ? npSum(z) / n : NaN
}

/** stats.deseasonalize + stats.annual_means from pipeline/stats.py, with numpy's summation order. */
export function npAnnualAnomalyMeans(values: number[], years: number[], months: number[], minMonths = 9): { years: number[]; means: number[] } {
  const overall = npNanMean(values)
  const des = new Array<number>(values.length).fill(NaN)
  for (let m = 1; m <= 12; m++) {
    const idx: number[] = []
    for (let i = 0; i < values.length; i++) if (months[i] === m) idx.push(i)
    const sel = idx.map((i) => values[i])
    if (!sel.some(Number.isFinite)) continue
    const mm = npNanMean(sel)
    for (const i of idx) des[i] = values[i] - mm + overall
  }
  const ys = [...new Set(years)].sort((a, b) => a - b)
  const means = ys.map((y) => {
    const sel = des.filter((_, i) => years[i] === y)
    return sel.filter(Number.isFinite).length >= minMonths ? npNanMean(sel) : NaN
  })
  return { years: ys, means }
}

/** Theil-Sen slope (per year) and Mann-Kendall p of one cell: the two numbers stats.analyze gives the map. */
export function cellTrend(years: number[], months: number[], values: number[]): { slope: number; p: number } {
  const a = npAnnualAnomalyMeans(values, years, months)
  const x: number[] = []
  const t: number[] = []
  a.years.forEach((y, i) => {
    if (Number.isFinite(a.means[i])) {
      x.push(a.means[i])
      t.push(y + 0.5)
    }
  })
  const mk = mannKendall(x, t)
  return { slope: senSlope(x, t, mk.varCorrected).slope, p: mk.p }
}

/** Per-cell trend map with Benjamini-Hochberg control (port of the loop in build.power_variable). */
export function trendMap(grid: PowerGrid, mask: boolean[], dlat: number, dlon: number, decimals: number): MapJSON {
  const { years, months } = axes(grid.start, grid.values[0]?.length ?? 0)
  const kept: [number, number, number][] = []
  const ps: number[] = []
  grid.values.forEach((row, k) => {
    if (!mask[k] || finiteShare(row) < CELL_COVERAGE) return
    const r = cellTrend(years, months, row)
    kept.push([grid.lat[k], grid.lon[k], r.slope * 10])
    ps.push(r.p)
  })
  const { sig } = bhFdr(ps)
  return {
    kind: 'grid',
    dlat,
    dlon,
    cells: kept.map(([la, lo, s], i) => [la, lo, roundTo(s, decimals + 2), roundTo(ps[i], 5), sig[i]]),
    n_sig: sig.filter(Boolean).length,
    n_sig_raw: ps.filter((p) => p < 0.05).length,
  }
}

export interface VariableResult {
  series?: SeriesJSON
  map?: MapJSON
  cells: number
  missing?: string
}

/** Regional series and trend map of one variable, or the reason there is none (port of build.main + power_variable). */
export function regionalVariable(grid: PowerGrid, mask: boolean[], dlat: number, dlon: number, decimals: number): VariableResult {
  const cells = mask.filter(Boolean).length
  if (!cells) return { cells, missing: 'No grid cell of this product falls on land in the box.' }
  const values = areaMean(grid, mask).map((v) => roundTo(v, decimals + 2))
  const { years } = axes(grid.start, values.length)
  const yearsWithData = new Set(years.filter((_, i) => Number.isFinite(values[i]))).size
  if (yearsWithData < MIN_YEARS) return { cells, missing: `Only ${yearsWithData} years with data here; a trend test needs at least ${MIN_YEARS}.` }
  return {
    cells,
    series: { start: grid.start, per_year: 12, values: values.map((v) => (Number.isFinite(v) ? v : null)) },
    map: trendMap(grid, mask, dlat, dlon, decimals),
  }
}

// ------------------------------------------------------------------ download with progress, retries and a cache

/** NASA POWER refused the request itself (HTTP 422): retrying will not help. */
export class PowerRejected extends Error {}

/** Tries per request, and how long a try may go without receiving a byte before it is given up. */
export const ATTEMPTS = 4
export const STALL_MS = 45_000

const memory = new Map<string, PowerGrid>()
const STORE = 'tl:power:v1:'

export function requestUrl(code: string, b: Box, start: number, end: number): string {
  const q = new URLSearchParams({
    parameters: code,
    community: 'AG',
    'latitude-min': String(b[0]),
    'latitude-max': String(b[1]),
    'longitude-min': String(b[2]),
    'longitude-max': String(b[3]),
    start: String(start),
    end: String(end),
    format: 'JSON',
  })
  return `${POWER_REGIONAL}?${q}`
}

const cacheKey = (code: string, b: Box, start: number, end: number) => `${STORE}${code}:${formatBox(b)}:${start}-${end}`

/**
 * Compact, lossless storage for sessionStorage: POWER sends two decimals, so values are kept as int16
 * hundredths in base64 (2.7 characters a value instead of about 6), which lets a full 10 x 10 box fit.
 * Grids with other precision fall back to plain JSON numbers.
 */
export function packGrid(g: PowerGrid): string {
  const flat = g.values.flat()
  const ints = new Int16Array(flat.length)
  let packed = true
  for (let i = 0; i < flat.length && packed; i++) {
    const v = flat[i]
    if (!Number.isFinite(v)) {
      ints[i] = -32768
      continue
    }
    const h = Math.round(v * 100)
    if (Math.abs(v * 100 - h) > 1e-6 || Math.abs(h) > 32767) packed = false
    else ints[i] = h
  }
  const head = { param: g.param, start: g.start, end: g.end, lat: g.lat, lon: g.lon, elev: g.elev.map((e) => (Number.isFinite(e) ? e : null)), n: g.values[0]?.length ?? 0 }
  if (!packed) return JSON.stringify({ ...head, json: g.values.map((r) => r.map((v) => (Number.isFinite(v) ? v : null))) })
  const bytes = new Uint8Array(ints.buffer)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return JSON.stringify({ ...head, i16: btoa(bin) })
}

export function unpackGrid(s: string): PowerGrid {
  const o = JSON.parse(s)
  const base = { param: o.param, start: o.start, end: o.end, lat: o.lat, lon: o.lon, elev: (o.elev as (number | null)[]).map((e) => e ?? NaN) }
  if (o.json) return { ...base, values: (o.json as (number | null)[][]).map((r) => r.map((v) => v ?? NaN)) }
  const bin = atob(o.i16)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const ints = new Int16Array(bytes.buffer)
  const values: number[][] = []
  for (let k = 0; k < o.lat.length; k++) values.push(Array.from(ints.subarray(k * o.n, (k + 1) * o.n), (h) => (h === -32768 ? NaN : h / 100)))
  return { ...base, values }
}

function session(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage
  } catch {
    return null
  }
}

function readCache(key: string): PowerGrid | null {
  const hit = memory.get(key)
  if (hit) return hit
  try {
    const s = session()?.getItem(key)
    if (!s) return null
    const g = unpackGrid(s)
    memory.set(key, g)
    return g
  } catch {
    return null
  }
}

/** Keep in memory; also in sessionStorage, dropping other boxes when the quota is full. */
function writeCache(key: string, g: PowerGrid, keepBox: string) {
  memory.set(key, g)
  if (memory.size > 40) memory.delete(memory.keys().next().value!)
  const ss = session()
  if (!ss) return
  try {
    const text = packGrid(g)
    try {
      ss.setItem(key, text)
    } catch {
      for (let i = ss.length - 1; i >= 0; i--) {
        const k = ss.key(i)
        if (k && k.startsWith(STORE) && !k.includes(`:${keepBox}:`)) ss.removeItem(k)
      }
      ss.setItem(key, text)
    }
  } catch {
    // still too big, or storage is blocked: memory only
  }
}

const aborted = (signal?: AbortSignal) => signal?.reason ?? new DOMException('Aborted', 'AbortError')

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t)
        reject(aborted(signal))
      },
      { once: true },
    )
  })

export interface FetchStatus {
  received: number
  total: number
  attempt: number
}

export interface FetchOptions {
  signal?: AbortSignal
  onStatus?: (s: FetchStatus) => void
  attempts?: number
  /** give up on an attempt when no bytes arrive for this long */
  stallMs?: number
  backoffMs?: number
}

/** One POWER request: retries network failures, stalls and server errors; gives up at once on a 422 (bad request). */
export async function fetchGrid(code: string, b: Box, start: number, end: number, opts: FetchOptions = {}): Promise<{ grid: PowerGrid; cached: boolean }> {
  const key = cacheKey(code, b, start, end)
  const hit = readCache(key)
  if (hit) return { grid: hit, cached: true }
  const { signal, onStatus, attempts = ATTEMPTS, stallMs = STALL_MS, backoffMs = 2_000 } = opts
  let last: unknown = null
  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (signal?.aborted) throw aborted(signal)
    onStatus?.({ received: 0, total: 0, attempt })
    const ctrl = new AbortController()
    const stop = () => ctrl.abort()
    signal?.addEventListener('abort', stop)
    let timer = setTimeout(stop, stallMs)
    const alive = () => {
      clearTimeout(timer)
      timer = setTimeout(stop, stallMs)
    }
    try {
      const r = await fetch(requestUrl(code, b, start, end), { signal: ctrl.signal })
      if (r.status === 422) {
        const body = await r.json().catch(() => null)
        const msg = Array.isArray(body?.messages) && body.messages.length ? body.messages.join(' ') : 'NASA POWER rejected this box.'
        throw new PowerRejected(msg)
      }
      if (!r.ok) throw new Error(`NASA POWER answered with HTTP ${r.status}.`)
      const total = Number(r.headers.get('content-length')) || 0
      let text: string
      if (r.body) {
        const reader = r.body.getReader()
        const chunks: Uint8Array[] = []
        let got = 0
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          chunks.push(value)
          got += value.length
          alive()
          onStatus?.({ received: got, total, attempt })
        }
        const buf = new Uint8Array(got)
        let o = 0
        for (const c of chunks) {
          buf.set(c, o)
          o += c.length
        }
        text = new TextDecoder().decode(buf)
      } else text = await r.text()
      const grid = parseRegional(JSON.parse(text), code, start, end)
      if (!grid.lat.length) throw new PowerRejected('NASA POWER found no grid cells in this box.')
      writeCache(key, grid, formatBox(b))
      return { grid, cached: false }
    } catch (e) {
      if (e instanceof PowerRejected) throw e
      if (signal?.aborted) throw aborted(signal)
      last = e
      if (attempt < attempts) await wait(backoffMs * attempt, signal)
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', stop)
    }
  }
  const why = last instanceof Error && last.name !== 'AbortError' ? last.message : 'Each try timed out.'
  throw new Error(`NASA POWER could not be reached after ${attempts} tries. ${why}`)
}

// ------------------------------------------------------------------ the whole region

export type ItemState = 'waiting' | 'loading' | 'cached' | 'done' | 'failed'

export interface LoadItem {
  key: string
  code: string
  start: number
  vids: string[]
  /** this download is also the land mask */
  mask: boolean
  state: ItemState
  received: number
  total: number
  attempt: number
  error?: string
}

export interface LoadProgress {
  phase: 'download' | 'compute' | 'done'
  items: LoadItem[]
}

export interface DrawnRegion {
  box: Box
  /** MERRA-2 cells POWER returned for the box, and how many of them are land */
  nCells: number
  nLand: number
  /** no land cell: variables that exist over water are then averaged over every cell */
  water: boolean
  /** mean elevation of the land cells, metres */
  elevation: number | null
  series: Record<string, SeriesJSON>
  maps: Record<string, MapJSON>
  /** cells averaged for each variable */
  cells: Record<string, number>
  missing: Record<string, string>
  /** variables whose download failed; a retry fetches only these, the rest come from the cache */
  failed: string[]
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0))

export interface LoadOptions {
  signal?: AbortSignal
  onProgress?: (p: LoadProgress) => void
  fetcher?: (code: string, b: Box, start: number, end: number, opts: FetchOptions) => Promise<{ grid: PowerGrid; cached: boolean }>
  concurrency?: number
}

/**
 * Download every live POWER variable for the box (one request per parameter, two at a time, the land mask
 * first), then build the regional series and trend maps. Downloads are cached for the session, so a retry
 * after a dropped connection only fetches what is still missing.
 */
export async function loadDrawnRegion(cat: Catalog, box: Box, opts: LoadOptions = {}): Promise<DrawnRegion> {
  const { signal, onProgress, fetcher = fetchGrid, concurrency = 2 } = opts
  const end = cat.end_year
  const vars = regionVariables(cat)
  const items: LoadItem[] = []
  const byKey = new Map<string, LoadItem>()
  const need = (code: string, start: number) => {
    const key = `${code}:${start}`
    let it = byKey.get(key)
    if (!it) {
      it = { key, code, start, vids: [], mask: false, state: 'waiting', received: 0, total: 0, attempt: 0 }
      byKey.set(key, it)
      items.push(it)
    }
    return it
  }
  const maskItem = need(MASK_PARAM, MASK_START)
  maskItem.mask = true
  const itemOf: Record<string, LoadItem> = {}
  for (const v of vars) {
    itemOf[v.vid] = need(v.code, v.start)
    itemOf[v.vid].vids.push(v.vid)
  }
  const emit = (phase: LoadProgress['phase']) => onProgress?.({ phase, items: items.map((i) => ({ ...i, vids: [...i.vids] })) })
  emit('download')

  const grids = new Map<string, PowerGrid>()
  const queue = [...items]
  let rejected: PowerRejected | null = null
  const worker = async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      const it = item
      it.state = 'loading'
      emit('download')
      try {
        const got = await fetcher(it.code, box, it.start, end, {
          signal,
          onStatus: (s) => {
            Object.assign(it, s)
            emit('download')
          },
        })
        grids.set(it.key, got.grid)
        it.state = got.cached ? 'cached' : 'done'
      } catch (e) {
        if (signal?.aborted) throw aborted(signal)
        it.state = 'failed'
        it.error = e instanceof Error ? e.message : String(e)
        if (e instanceof PowerRejected) {
          // the box itself was refused, so every other request would be refused too
          rejected = e
          for (const q of queue.splice(0)) Object.assign(q, { state: 'failed', error: e.message })
        }
      }
      emit('download')
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker))
  if (signal?.aborted) throw aborted(signal)

  const maskGrid = grids.get(maskItem.key)
  if (rejected) throw rejected
  if (!maskGrid) throw new Error(maskItem.error ?? 'The land mask could not be downloaded.')
  emit('compute')
  await tick()

  const land = landCells(maskGrid)
  const nLand = land.filter(Boolean).length
  const water = nLand === 0
  const elev = maskGrid.elev.filter((e, i) => land[i] && Number.isFinite(e))
  const out: DrawnRegion = {
    box,
    nCells: land.length,
    nLand,
    water,
    elevation: elev.length ? elev.reduce((a, b) => a + b, 0) / elev.length : null,
    series: {},
    maps: {},
    cells: {},
    missing: {},
    failed: [],
  }

  for (const v of vars) {
    const meta = cat.variables[v.vid]
    const grid = grids.get(itemOf[v.vid].key)
    if (!grid) {
      out.failed.push(v.vid)
      out.missing[v.vid] = `Download failed. ${itemOf[v.vid].error ?? ''}`.trim()
      continue
    }
    if (water && meta.land_only) {
      out.missing[v.vid] = 'Land-only variable, and this box has no land cell.'
      continue
    }
    const { mask, dlat, dlon } = maskOn(grid, maskGrid, land)
    const res = regionalVariable(grid, water ? grid.lat.map(() => true) : mask, dlat, dlon, meta.decimals)
    out.cells[v.vid] = res.cells
    if (res.series && res.map) {
      out.series[v.vid] = res.series
      out.maps[v.vid] = res.map
    } else out.missing[v.vid] = res.missing ?? 'No data.'
    await tick()
    if (signal?.aborted) throw aborted(signal)
  }
  emit('done')
  return out
}

// ------------------------------------------------------------------ checking a featured box against the pipeline

export interface CheckRow {
  vid: string
  what: 'trend per decade' | '95% interval low' | '95% interval high' | 'p-value' | 'verdict'
  browser: string
  published: string
  ok: boolean
}

/**
 * Compare browser results for a featured box with the pipeline's catalog.json, field by field, at the precision
 * the site displays (a difference smaller than half the last shown digit counts as a match).
 */
export function compareWithCatalog(cat: Catalog, rid: string, analyses: Record<string, Analysis>): CheckRow[] {
  const published = cat.results[rid] ?? {}
  const rows: CheckRow[] = []
  for (const [vid, a] of Object.entries(analyses)) {
    const s = published[vid]
    if (!s) continue
    const d = decimalsFor(Math.max(Math.abs(s.slope), Math.abs(s.high - s.low) / 4))
    const tol = 0.5 * 10 ** -d + 1e-9
    const num = (what: CheckRow['what'], b: number, p: number) => rows.push({ vid, what, browser: fmt(b, d, true), published: fmt(p, d, true), ok: Math.abs(b - p) <= tol })
    num('trend per decade', a.sen.slope * 10, s.slope)
    num('95% interval low', a.sen.low * 10, s.low)
    num('95% interval high', a.sen.high * 10, s.high)
    const pTol = s.p < 0.1 ? 0.0005 : 0.005
    rows.push({ vid, what: 'p-value', browser: fmtP(a.mk.p), published: fmtP(s.p), ok: (a.mk.p < 0.001 && s.p < 0.001) || Math.abs(a.mk.p - s.p) <= pTol + 1e-9 })
    rows.push({ vid, what: 'verdict', browser: a.verdict, published: s.verdict, ok: a.verdict === s.verdict })
  }
  return rows
}

// ------------------------------------------------------------------ export

/** Every regional series as one CSV, with the box, method and sources in comment lines. */
export function regionCsv(cat: Catalog, r: DrawnRegion, name: string): string {
  const vids = Object.keys(r.series)
  const first = Math.min(...vids.map((v) => r.series[v].start))
  const lines = [
    `# TrendLens drawn region: ${name} (lat ${r.box[0]} to ${r.box[1]}, lon ${r.box[2]} to ${r.box[3]})`,
    `# ${r.water ? `All ${r.nCells} grid cells (no land cell in the box)` : `${r.nLand} land cells of ${r.nCells} MERRA-2 cells`}; cos(latitude) area-weighted monthly means`,
    `# Source: NASA POWER monthly regional API (${POWER_REGIONAL}), downloaded ${new Date().toISOString().slice(0, 10)}`,
    ...vids.map((v) => `# ${v}: ${cat.variables[v].name} (${cat.variables[v].unit}). ${cat.variables[v].source}`),
    ['year', 'month', ...vids.map((v) => `${v}_${cat.variables[v].unit}`)].join(','),
  ]
  for (let y = first; y <= cat.end_year; y++)
    for (let m = 1; m <= 12; m++) {
      const cols = vids.map((v) => {
        const s = r.series[v]
        const val = s.values[(y - s.start) * 12 + (m - 1)]
        return val === null || val === undefined ? '' : String(val)
      })
      lines.push([y, m, ...cols].join(','))
    }
  return lines.join('\n')
}
