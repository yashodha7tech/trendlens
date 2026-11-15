import { analyze, type Analysis } from './stats'
import type { Catalog, Place, RegionJSON, SeriesJSON, StationJSON } from './types'

let catalogPromise: Promise<Catalog> | null = null
const regionCache = new Map<string, Promise<RegionJSON>>()
const pointCache = new Map<string, Promise<Place>>()

async function getJSON<T>(url: string): Promise<T> {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`Could not load ${url} (${r.status})`)
  return r.json() as Promise<T>
}

export function loadCatalog(): Promise<Catalog> {
  catalogPromise ??= getJSON<Catalog>('/data/catalog.json')
  return catalogPromise
}

export function loadRegion(id: string): Promise<RegionJSON> {
  if (!regionCache.has(id)) regionCache.set(id, getJSON<RegionJSON>(`/data/regions/${id}.json`))
  return regionCache.get(id)!
}

export async function loadRegionPlace(cat: Catalog, id: string): Promise<Place> {
  const reg = cat.regions[id]
  if (!reg) throw new Error(`Unknown region "${id}"`)
  const data = await loadRegion(id)
  return {
    id,
    kind: 'region',
    name: reg.name,
    subtitle: reg.country,
    lat: reg.center[0],
    lon: reg.center[1],
    bbox: reg.bbox,
    region: reg,
    series: data.series,
    maps: data.maps,
    stations: data.stations,
  }
}

// ------------------------------------------------------------------ series helpers

export function seriesAxes(s: SeriesJSON): { years: number[]; months?: number[] } {
  if (s.per_year === 12) {
    return {
      years: s.values.map((_, i) => s.start + Math.floor(i / 12)),
      months: s.values.map((_, i) => (i % 12) + 1),
    }
  }
  return { years: s.values.map((_, i) => s.start + i) }
}

/** Analyse a series, optionally restricted to a start year. */
export function analyzeSeries(s: SeriesJSON, from?: number): Analysis {
  const { years, months } = seriesAxes(s)
  if (!from || from <= s.start) return analyze(years, s.values, s.per_year, months)
  const keep = years.map((y, i) => (y >= from ? i : -1)).filter((i) => i >= 0)
  return analyze(
    keep.map((i) => years[i]),
    keep.map((i) => s.values[i]),
    s.per_year,
    months ? keep.map((i) => months[i]) : undefined,
  )
}

// ------------------------------------------------------------------ live mode (any point on Earth)

/** TrendLens variable id -> NASA POWER parameter (the same codes as pipeline/config.py). */
const POWER_PARAMS: Record<string, string> = {
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

export const LIVE_VARIABLES = Object.keys(POWER_PARAMS)

/** POWER request URL for one grid cell: every live variable the catalog knows, in one call. */
export function pointUrl(cat: Catalog, lat: number, lon: number): string {
  const codes = Object.entries(POWER_PARAMS)
    .filter(([vid]) => cat.variables[vid])
    .map(([, code]) => code)
  return (
    `https://power.larc.nasa.gov/api/temporal/monthly/point?parameters=${codes.join(',')}` +
    `&community=AG&longitude=${lon.toFixed(3)}&latitude=${lat.toFixed(3)}&start=1981&end=${cat.end_year}&format=JSON`
  )
}

/** Fetch every POWER variable for one grid cell straight from NASA POWER (CORS-enabled). */
export function loadPoint(cat: Catalog, lat: number, lon: number, label?: string): Promise<Place> {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`
  if (pointCache.has(key)) return pointCache.get(key)!
  const p = (async () => {
    const end = cat.end_year
    const raw = await getJSON<any>(pointUrl(cat, lat, lon))
    const params = raw?.properties?.parameter
    if (!params) throw new Error('NASA POWER returned no data for this point.')
    const series: Record<string, SeriesJSON> = {}
    const missing: Record<string, string> = {}
    for (const [vid, code] of Object.entries(POWER_PARAMS)) {
      if (!cat.variables[vid]) continue // an older catalog without this variable
      const start = cat.variables[vid].start
      const vals: (number | null)[] = []
      for (let y = start; y <= end; y++)
        for (let m = 1; m <= 12; m++) {
          const v = params[code]?.[`${y}${String(m).padStart(2, '0')}`]
          vals.push(typeof v === 'number' && v > -998 ? v : null)
        }
      const filled = vals.filter((v) => v !== null).length
      if (filled < 15 * 12) {
        missing[vid] = cat.variables[vid].land_only ? 'Land-only variable: this point is over water.' : 'Not enough data at this point.'
        continue
      }
      series[vid] = { start, per_year: 12, values: vals }
    }
    const elev = raw?.geometry?.coordinates?.[2]
    return {
      id: `point:${key}`,
      kind: 'point',
      name: label ?? formatLatLon(lat, lon),
      subtitle: `MERRA-2 / CERES grid cell at ${formatLatLon(lat, lon)}${typeof elev === 'number' ? ` · ${Math.round(elev)} m elevation` : ''}`,
      lat,
      lon,
      series,
      maps: {},
      stations: {},
      missing,
    } satisfies Place
  })()
  pointCache.set(key, p)
  p.catch(() => pointCache.delete(key))
  return p
}

export function formatLatLon(lat: number, lon: number): string {
  const la = `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}`
  const lo = `${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`
  return `${la}, ${lo}`
}

/** Place-name search (Open-Meteo geocoder, CORS-enabled, no key). */
export async function geocode(q: string): Promise<{ name: string; lat: number; lon: number } | null> {
  const r = await getJSON<any>(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en&format=json`)
  const g = r?.results?.[0]
  if (!g) return null
  return { name: [g.name, g.admin1, g.country].filter(Boolean).join(', '), lat: g.latitude, lon: g.longitude }
}

// ------------------------------------------------------------------ live station check (NOAA CDO)

/** Nearest long-record station in NOAA Climate Data Online (GSOM), compared with the MERRA-2 cell. */
export async function liveStationCheck(lat: number, lon: number, place: Place, vid: 't2m' | 'precip'): Promise<StationJSON> {
  const field = vid === 't2m' ? 'TAVG' : 'PRCP'
  const d = 1.0
  const bbox = `${(lat + d).toFixed(2)},${(lon - d).toFixed(2)},${(lat - d).toFixed(2)},${(lon + d).toFixed(2)}`
  const search = await getJSON<any>(
    `https://www.ncei.noaa.gov/access/services/search/v1/data?dataset=global-summary-of-the-month&bbox=${bbox}` +
      `&startDate=1981-01-01&endDate=2025-12-31&dataTypes=${field}&limit=100`,
  )
  type Cand = { id: string; name: string; lat: number; lon: number; span: number; dist: number }
  const cands: Cand[] = []
  for (const r of search?.results ?? []) {
    const st = r.stations?.[0]
    const dt = st?.dataTypes?.find((x: any) => x.id === field)
    if (!dt) continue
    const s = +dt.dateRange.start.slice(0, 4)
    const e = +dt.dateRange.end.slice(0, 4)
    const [slon, slat] = r.boundingPoints[0].coordinates
    if (s > 1990 || e < 2020) continue
    cands.push({ id: st.id, name: st.name, lat: slat, lon: slon, span: e - Math.max(s, 1981), dist: Math.hypot(slat - lat, slon - lon) })
  }
  cands.sort((a, b) => a.dist - b.dist)
  if (!cands.length) return { stations: [], note: 'No station within about 100 km has a long record in NOAA Climate Data Online.' }
  const st = cands[0]
  const rows = await getJSON<any[]>(
    `https://www.ncei.noaa.gov/access/services/data/v1?dataset=global-summary-of-the-month&stations=${st.id}` +
      `&startDate=1981-01-01&endDate=2025-12-31&dataTypes=${field}&format=json&units=metric`,
  )
  const byMonth = new Map<string, number>()
  for (const r of rows) if (r[field] !== undefined && r[field] !== '') byMonth.set(r.DATE, +r[field])
  const s = place.series[vid]
  const { years, months } = seriesAxes(s)
  const stVals: (number | null)[] = []
  const m2Vals: (number | null)[] = []
  years.forEach((y, i) => {
    if (y < 1981) return
    const key = `${y}-${String(months![i]).padStart(2, '0')}`
    let v = byMonth.get(key)
    if (v !== undefined && field === 'PRCP') v = v / new Date(y, months![i], 0).getDate()
    const ok = v !== undefined && s.values[i] !== null
    stVals.push(ok ? (v as number) : null)
    m2Vals.push(ok ? s.values[i] : null)
  })
  const filled = stVals.filter((v) => v !== null).length
  if (filled < 0.7 * stVals.length)
    return { stations: [], note: `The nearest station (${titleCase(st.name)}) has too many missing months for a fair comparison.` }
  const yrs = years.filter((y) => y >= 1981)
  const mos = months!.filter((_, i) => years[i] >= 1981)
  const a = analyze(yrs, stVals, 12, mos)
  const b = analyze(yrs, m2Vals, 12, mos)
  const anomalies = (an: Analysis) => {
    const ok = an.annual.filter((v) => Number.isFinite(v))
    const mean = ok.reduce((x, y) => x + y, 0) / ok.length
    return an.annual.map((v) => (Number.isFinite(v) ? v - mean : NaN))
  }
  const sa = anomalies(a)
  const ma = anomalies(b)
  const keep = a.annualYears.map((_, i) => Number.isFinite(sa[i]) && Number.isFinite(ma[i]))
  const xs = sa.filter((_, i) => keep[i])
  const ys2 = ma.filter((_, i) => keep[i])
  const r = pearson(xs, ys2)
  const tr = (an: Analysis) => ({ slope: an.sen.slope * 10, low: an.sen.low * 10, high: an.sen.high * 10, p: an.mk.p })
  return {
    stations: [{ id: st.id, name: titleCase(st.name), lat: st.lat, lon: st.lon, coverage: filled / stVals.length }],
    years: a.annualYears.filter((_, i) => keep[i]),
    station: xs,
    merra2: ys2,
    trend: { station: tr(a), merra2: tr(b) },
    r,
    same_direction: Math.sign(a.sen.slope) === Math.sign(b.sen.slope),
    both_significant: a.mk.p < 0.05 && b.mk.p < 0.05,
  }
}

function pearson(a: number[], b: number[]): number {
  const n = a.length
  const ma = a.reduce((x, y) => x + y, 0) / n
  const mb = b.reduce((x, y) => x + y, 0) / n
  let sab = 0
  let saa = 0
  let sbb = 0
  for (let i = 0; i < n; i++) {
    sab += (a[i] - ma) * (b[i] - mb)
    saa += (a[i] - ma) ** 2
    sbb += (b[i] - mb) ** 2
  }
  return sab / Math.sqrt(saa * sbb)
}

const titleCase = (s: string) => s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/, ([a-z]{2})$/i, (m) => m.toUpperCase())
