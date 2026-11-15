import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { analyzeSeries } from './data'
import {
  PowerRejected,
  areaMean,
  boxLabel,
  clampBox,
  compareWithCatalog,
  estimateCells,
  fetchGrid,
  formatBox,
  landCells,
  loadDrawnRegion,
  maskOn,
  monthKeys,
  packGrid,
  parseBox,
  parseRegional,
  regionCsv,
  regionalVariable,
  roundTo,
  trendMap,
  unpackGrid,
  type Box,
  type LoadProgress,
  type PowerGrid,
} from './regional'
import type { Analysis } from './stats'
import type { Catalog, SeriesJSON } from './types'
import fx from './__fixtures__/power_regional.json'

/**
 * Recorded NASA POWER monthly/regional responses for a small coastal box (18-20N, 72-74E, 2006-2020) with the
 * values pipeline/build.py computes from them (made by scratchpad tool make_regional_fixture.py, which imports
 * power.regional, build.land_mask, build.area_mean, stats.analyze and stats.bh_fdr).
 */
interface Expected {
  mask: boolean[]
  dlat: number
  dlon: number
  series: (number | null)[]
  rounded: (number | null)[]
  decimals: number
  slope: number
  low: number
  high: number
  p: number
  cells: unknown[]
  n_sig: number
  n_sig_raw: number
}
const close = (a: number, b: number, rel = 1e-9, abs = 1e-12) => expect(Math.abs(a - b) <= Math.max(abs, rel * Math.abs(b)), `${a} vs ${b}`).toBe(true)
const grid = (param: keyof typeof fx.raw, body: unknown = fx.raw[param]) => parseRegional(body, param, fx.start, fx.end)
const nanToNull = (a: number[]) => a.map((v) => (Number.isFinite(v) ? v : null))

function gappyT2M() {
  const body = JSON.parse(JSON.stringify(fx.raw.T2M))
  const keys = monthKeys(fx.start, fx.end)
  for (const [cell, idx] of Object.entries(fx.gaps)) for (const i of idx) body.features[Number(cell)].properties.parameter.T2M[keys[i]] = -999.0
  return body
}

function checkVariable(g: PowerGrid, e: Expected) {
  const maskGrid = grid('GWETROOT')
  const land = landCells(maskGrid)
  const { mask, dlat, dlon } = maskOn(g, maskGrid, land)
  expect(mask).toEqual(e.mask)
  expect([dlat, dlon]).toEqual([e.dlat, e.dlon])
  const series = areaMean(g, mask)
  series.forEach((v, i) => (e.series[i] === null ? expect(v).toBeNaN() : close(v, e.series[i]!)))
  expect(nanToNull(series.map((v) => roundTo(v, e.decimals + 2)))).toEqual(e.rounded)

  const res = regionalVariable(g, mask, dlat, dlon, e.decimals)
  expect(res.series!.values).toEqual(e.rounded)
  const a = analyzeSeries(res.series!)
  close(a.sen.slope, e.slope)
  close(a.sen.low, e.low)
  close(a.sen.high, e.high)
  close(a.mk.p, e.p, 1e-7)

  const map = trendMap(g, mask, dlat, dlon, e.decimals)
  expect(map.cells).toEqual(e.cells)
  expect([map.n_sig, map.n_sig_raw]).toEqual([e.n_sig, e.n_sig_raw])
}

describe('NASA POWER regional response -> pipeline results', () => {
  it('parses cells, coordinates, elevation and fill values', () => {
    const g = grid('T2M')
    expect(g.lat.length).toBe(fx.raw.T2M.features.length)
    expect(g.values[0].length).toBe((fx.end - fx.start + 1) * 12)
    expect([g.lat[0], g.lon[0]]).toEqual([18, 72.5])
    const gw = grid('GWETROOT')
    const fills = fx.raw.GWETROOT.features.flatMap((f) => monthKeys(fx.start, fx.end).map((k) => (f.properties.parameter.GWETROOT as Record<string, number>)[k])).filter((v) => v === -999).length
    expect(gw.values.flat().filter((v) => Number.isNaN(v)).length).toBe(fills) // fill values (sea cells) become NaN
    expect(fills).toBeGreaterThan(0)
  })
  it('builds the land mask from GWETROOT like build.py', () => {
    expect(landCells(grid('GWETROOT'))).toEqual(fx.expected.land)
  })
  it('MERRA-2 variable (T2M): mask, area-weighted series, statistics and FDR trend map', () => {
    checkVariable(grid('T2M'), fx.expected.T2M as Expected)
  })
  it('CERES 1-degree variable (AOD): coarse-cell land rule, series, statistics and map', () => {
    checkVariable(grid('AOD_55_ADJ'), fx.expected.AOD_55_ADJ as Expected)
  })
  it('missing months: weights skip gaps and cells under 90% coverage leave the map', () => {
    checkVariable(grid('T2M', gappyT2M()), fx.expected.T2M_gappy as Expected)
    expect(fx.expected.T2M_gappy.cells.length).toBe(fx.expected.T2M.cells.length - 1)
  })
  it('round-trips grids through the compact session cache format', () => {
    const g = grid('T2M', gappyT2M())
    const back = unpackGrid(packGrid(g))
    expect(nanToNull(back.values.flat())).toEqual(nanToNull(g.values.flat()))
    expect([back.lat, back.lon, back.elev, back.start, back.end]).toEqual([g.lat, g.lon, g.elev, g.start, g.end])
    const odd = { ...g, values: [[1.234, NaN]] }
    expect(nanToNull(unpackGrid(packGrid(odd)).values[0])).toEqual([1.234, null])
  })
})

describe('boxes', () => {
  it('clamps to what POWER accepts: 2 to 10 degrees, ordered, on the globe', () => {
    expect(clampBox([24, 28, 77, 87])).toEqual([24, 28, 77, 87])
    expect(clampBox([28, 24, 87, 77])).toEqual([24, 28, 77, 87])
    expect(clampBox([0, 15, 10, 30])).toEqual([2.5, 12.5, 15, 25])
    expect(clampBox([10, 10.5, 20, 21])).toEqual([9.25, 11.25, 19.5, 21.5])
    expect(clampBox([85, 95, 0, 4])).toEqual([80, 90, 0, 4])
    expect(clampBox([0, 4, 400, 404])).toEqual([0, 4, 40, 44]) // a wrapped Leaflet longitude
    expect(clampBox([0, 4, 175, 185])).toEqual([0, 4, -180, -170]) // cannot cross the 180th meridian
    expect(clampBox([1.234, 5.678, -3.333, 2.222])).toEqual([1.23, 5.68, -3.33, 2.22])
  })
  it('reads and writes the share-link format', () => {
    expect(parseBox('24,28,77,87')).toEqual([24, 28, 77, 87])
    expect(parseBox('24,28,77')).toBeNull()
    expect(parseBox('a,b,c,d')).toBeNull()
    expect(parseBox('24,,77,87')).toBeNull()
    expect(formatBox([-14, -6.5, -60, -50.25])).toBe('-14,-6.5,-60,-50.25')
  })
  it('labels boxes in every hemisphere', () => {
    expect(boxLabel([24, 28, 77, 87])).toBe('24°–28°N, 77°–87°E')
    expect(boxLabel([-14, -6, -60, -50])).toBe('14°–6°S, 60°–50°W')
    expect(boxLabel([-2, 3, -5, 5])).toBe('2°S–3°N, 5°W–5°E')
  })
  it('predicts the number of grid cells POWER returns', () => {
    expect(estimateCells(fx.bbox as Box)).toBe(fx.raw.T2M.features.length)
    expect(estimateCells(fx.bbox as Box, 'ceres')).toBe(fx.raw.AOD_55_ADJ.features.length)
    expect(estimateCells([24, 28, 77, 87])).toBe(144) // catalog.json: igp has 144 land cells, all of them land
    expect(estimateCells([24, 28, 77, 87], 'ceres')).toBe(40)
    expect(estimateCells([20, 30, 75, 85])).toBe(357)
  })
})

// a catalog with three of the live variables, all starting with the recorded period
const meta = (decimals: number, land_only: boolean) => ({ name: 'x', short: 'x', topic: 'heat', unit: 'u', decimals, definition: '', source: 's', instrument: '', start: fx.start, land_only, agg: 'mean' })
const fakeCat = {
  end_year: fx.end,
  variables: { t2m: meta(2, false), soil: meta(4, true), aod: meta(4, false) },
  regions: {},
  results: {},
} as unknown as Catalog

const fakeFetcher =
  (raws: Record<string, unknown> = fx.raw, fail: Record<string, Error> = {}) =>
  async (code: string) => {
    if (fail[code]) throw fail[code]
    return { grid: parseRegional(raws[code], code, fx.start, fx.end), cached: false }
  }

describe('loadDrawnRegion', () => {
  it('downloads the mask and each variable once, then reproduces the pipeline', async () => {
    const calls: string[] = []
    const phases: LoadProgress[] = []
    const base = fakeFetcher()
    const r = await loadDrawnRegion(fakeCat, fx.bbox as Box, {
      fetcher: async (code, _b, start, end) => {
        calls.push(`${code}:${start}-${end}`)
        return base(code)
      },
      onProgress: (p) => phases.push(p),
    })
    expect(calls.sort()).toEqual(['AOD_55_ADJ:2006-2020', 'GWETROOT:1981-2020', 'GWETROOT:2006-2020', 'T2M:2006-2020'])
    expect(phases[phases.length - 1].phase).toBe('done')
    expect(phases[0].items.find((i) => i.mask)?.code).toBe('GWETROOT')
    expect([r.nCells, r.nLand, r.water]).toEqual([15, fx.expected.land.filter(Boolean).length, false])
    expect(r.series.t2m.values).toEqual(fx.expected.T2M.rounded)
    expect(r.series.aod.values).toEqual(fx.expected.AOD_55_ADJ.rounded)
    expect(r.maps.t2m.cells).toEqual(fx.expected.T2M.cells)
    expect(r.cells).toEqual({ t2m: 13, soil: 13, aod: 3 })
    expect(r.failed).toEqual([])
  })

  it('an all-water box skips land-only variables and averages the rest over every cell', async () => {
    const sea = JSON.parse(JSON.stringify(fx.raw.GWETROOT))
    for (const f of sea.features) for (const k of Object.keys(f.properties.parameter.GWETROOT)) f.properties.parameter.GWETROOT[k] = -999.0
    const r = await loadDrawnRegion(fakeCat, fx.bbox as Box, { fetcher: fakeFetcher({ ...fx.raw, GWETROOT: sea }) })
    expect([r.water, r.nLand]).toEqual([true, 0])
    expect(r.series.soil).toBeUndefined()
    expect(r.missing.soil).toMatch(/Land-only/)
    const all = areaMean(grid('T2M'), new Array(15).fill(true)).map((v) => roundTo(v, 4))
    expect(r.series.t2m.values).toEqual(nanToNull(all))
    expect(r.cells.t2m).toBe(15)
  })

  it('keeps going when one variable fails and lists it for a retry', async () => {
    const r = await loadDrawnRegion(fakeCat, fx.bbox as Box, { fetcher: fakeFetcher(fx.raw, { AOD_55_ADJ: new Error('NASA POWER answered with HTTP 503.') }) })
    expect(r.failed).toEqual(['aod'])
    expect(r.missing.aod).toMatch(/503/)
    expect(r.series.t2m).toBeDefined()
  })

  it('stops at once when POWER rejects the box', async () => {
    const no = new PowerRejected('Please provide a maximum of 10 degree range in longitude.')
    await expect(loadDrawnRegion(fakeCat, [0, 4, 0, 11], { fetcher: fakeFetcher(fx.raw, { GWETROOT: no, T2M: no, AOD_55_ADJ: no }) })).rejects.toBeInstanceOf(PowerRejected)
  })
})

describe('fetchGrid', () => {
  afterEach(() => vi.unstubAllGlobals())
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

  it('turns a 422 into PowerRejected with POWER’s own message, without retrying', async () => {
    const f = vi.fn(async () => json({ messages: ['Please provide at least a 2 degree range in latitude; otherwise use the point endpoint.'] }, 422))
    vi.stubGlobal('fetch', f)
    await expect(fetchGrid('T2M', [0, 1, 0, 4], 2006, 2020, { backoffMs: 1 })).rejects.toThrow(/2 degree range/)
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('retries a dropped connection, reports progress, then serves the box from the cache', async () => {
    let n = 0
    const f = vi.fn(async () => {
      if (++n === 1) throw new TypeError('Failed to fetch')
      return json(fx.raw.T2M)
    })
    vi.stubGlobal('fetch', f)
    const seen: number[] = []
    const first = await fetchGrid('T2M', [18, 20, 72, 74.01], fx.start, fx.end, { backoffMs: 1, onStatus: (s) => seen.push(s.attempt) })
    expect(first.cached).toBe(false)
    expect(Math.max(...seen)).toBe(2)
    expect(first.grid.lat.length).toBe(15)
    const again = await fetchGrid('T2M', [18, 20, 72, 74.01], fx.start, fx.end)
    expect(again.cached).toBe(true)
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('gives up with a clear message after the last try', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({}, 503)))
    await expect(fetchGrid('T2M', [18, 20, 72, 74.02], fx.start, fx.end, { attempts: 2, backoffMs: 1 })).rejects.toThrow(/after 2 tries.*503/)
  })
})

describe('checking a featured box against catalog.json', () => {
  const s: SeriesJSON = { start: fx.start, per_year: 12, values: fx.expected.T2M.rounded }
  const a = analyzeSeries(s)
  const summary = (slope: number, p: number) => ({ slope, low: a.sen.low * 10, high: a.sen.high * 10, p, verdict: a.verdict })
  const catWith = (sm: object) => ({ ...fakeCat, results: { box: { t2m: sm } } }) as unknown as Catalog
  it('matches when the published numbers agree to display precision', () => {
    const rows = compareWithCatalog(catWith(summary(roundTo(a.sen.slope * 10, 4), roundTo(a.mk.p, 6))), 'box', { t2m: a })
    expect(rows.length).toBe(5)
    expect(rows.every((r) => r.ok)).toBe(true)
  })
  it('flags a slope that differs in a shown digit', () => {
    const rows = compareWithCatalog(catWith(summary(a.sen.slope * 10 + 0.05, a.mk.p)), 'box', { t2m: a } as Record<string, Analysis>)
    expect(rows.find((r) => r.what === 'trend per decade')?.ok).toBe(false)
  })
})

describe('CSV export', () => {
  it('writes one row per month and one column per variable', async () => {
    const r = await loadDrawnRegion(fakeCat, fx.bbox as Box, { fetcher: fakeFetcher() })
    const lines = regionCsv(fakeCat, r, 'test box').split('\n')
    const header = lines.find((l) => l.startsWith('year,'))!
    expect(header).toBe('year,month,t2m_u,soil_u,aod_u')
    expect(lines.filter((l) => /^\d{4},/.test(l)).length).toBe((fx.end - fx.start + 1) * 12)
  })
})

/**
 * Live check against NASA POWER for the featured Indo-Gangetic Plain box: TRENDLENS_LIVE=1 npx vitest run regional
 * (needs the network; about 6 MB).
 */
describe.skipIf(!process.env.TRENDLENS_LIVE)('live: the igp box from POWER matches catalog.json', () => {
  it('every live variable agrees with the published pipeline result', { timeout: 600_000 }, async () => {
    const cat = JSON.parse(readFileSync(join(__dirname, '../../public/data/catalog.json'), 'utf8')) as Catalog
    const box = cat.regions.igp.bbox as Box
    const r = await loadDrawnRegion(cat, box, { fetcher: (c, b, st, e, o) => fetchGrid(c, b, st, e, { ...o, backoffMs: 5_000 }) })
    expect(r.nLand).toBe(cat.regions.igp.land_cells)
    const analyses = Object.fromEntries(Object.entries(r.series).map(([v, s]) => [v, analyzeSeries(s)]))
    const rows = compareWithCatalog(cat, 'igp', analyses)
    for (const [vid, an] of Object.entries(analyses)) {
      const pub = cat.results.igp[vid]
      if (pub) console.log(`${vid.padEnd(9)} slope ${(an.sen.slope * 10).toFixed(6)} vs ${pub.slope}  p ${an.mk.p.toFixed(6)} vs ${pub.p}  ${an.verdict} vs ${pub.verdict}`)
    }
    expect(rows.filter((x) => !x.ok)).toEqual([])
    expect(rows.length).toBeGreaterThanOrEqual(5 * 6)
  })
})
