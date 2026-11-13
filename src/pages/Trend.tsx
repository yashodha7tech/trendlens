import { useMemo, useState } from 'react'
import { Badge, Dir, ErrorBox, Loading, SensitivityStrip } from '../components/bits'
import StationChart from '../components/StationChart'
import TimeSeriesChart from '../components/TimeSeriesChart'
import TrendMap from '../components/TrendMap'
import WorldMap from '../components/WorldMap'
import { analyzeSeries, liveStationCheck, loadPoint, loadRegionPlace, seriesAxes } from '../lib/data'
import { decimalsFor, fmt, fmtP, pText, rate, sentence, unitText, verdictLabel } from '../lib/format'
import { useAsync, useTitle } from '../lib/hooks'
import { href, navigate, setQuery } from '../lib/router'
import { deseasonalize, mannKendall, sensitivity, type Analysis } from '../lib/stats'
import type { Catalog, Place, StationJSON, VariableMeta } from '../lib/types'

interface Props {
  cat: Catalog
  region?: string
  variable?: string
  query: URLSearchParams
}

export default function Trend({ cat, region, variable, query }: Props) {
  const isPoint = region === 'point'
  const lat = Number(query.get('lat'))
  const lon = Number(query.get('lon'))
  const name = query.get('name') ?? undefined
  const place = useAsync(
    () => (isPoint ? loadPoint(cat, lat, lon, name) : loadRegionPlace(cat, region ?? '')),
    [region, isPoint ? `${lat},${lon}` : ''],
  )
  if (!variable || !cat.variables[variable]) return <ErrorBox message="Unknown variable." />
  if (place.error) return <ErrorBox message={place.error} />
  if (!place.data) return <Loading what={isPoint ? 'Fetching live data from NASA POWER' : 'Loading NASA data'} />
  const s = place.data.series[variable]
  if (!s) return <ErrorBox message={place.data.missing?.[variable] ?? `No ${cat.variables[variable].name.toLowerCase()} data for this place.`} />
  return <TrendView cat={cat} place={place.data} vid={variable} query={query} />
}

function TrendView({ cat, place, vid, query }: { cat: Catalog; place: Place; vid: string; query: URLSearchParams }) {
  const meta = cat.variables[vid]
  const series = place.series[vid]
  const monthly = series.per_year === 12
  const view = monthly && query.get('view') === 'raw' ? 'raw' : 'deseasonalized'
  const fromQ = Number(query.get('from')) || undefined
  const from = fromQ && fromQ > series.start ? fromQ : undefined
  const placeName = place.kind === 'region' ? `the ${place.name}` : place.name
  useTitle(`${meta.name} · ${place.name}`)

  const full = useMemo(() => analyzeSeries(series), [series])
  const a = useMemo(() => (from ? analyzeSeries(series, from) : full), [series, from, full])
  const sens = useMemo(() => sensitivity(full.annualYears, full.annual), [full])
  const axes = useMemo(() => seriesAxes(series), [series])
  const monthlyTest = useMemo(() => {
    if (!monthly) return null
    const des = deseasonalize(series.values, axes.months!)
    const t = axes.years.map((y, i) => y + (axes.months![i] - 0.5) / 12)
    const keep = t.map((_, i) => (axes.years[i] >= (from ?? 0) && Number.isFinite(des[i]) ? i : -1)).filter((i) => i >= 0)
    return mannKendall(
      keep.map((i) => des[i]),
      keep.map((i) => t[i]),
    )
  }, [series, axes, monthly, from])

  const r = rate(a, meta)
  const unit = unitText(meta).trim()
  const sd = decimalsFor(a.sen.slope * 10)
  const otherVars = Object.keys(place.series)
  const routeBase = place.kind === 'region' ? ['trend', place.id] : ['trend', 'point']
  const pointQ = place.kind === 'point' ? { lat: place.lat.toFixed(3), lon: place.lon.toFixed(3), name: query.get('name') ?? undefined } : {}

  return (
    <>
      <div className="page-head">
        <div className="wrap">
          <nav className="crumbs small" aria-label="Breadcrumb">
            {place.kind === 'region' ? (
              <>
                <a href="#/explore">Explore</a>
                <span className="sep">/</span>
                <a href={href(['explore', place.id])}>{place.name}</a>
              </>
            ) : (
              <>
                <a href={href(['anywhere'], pointQ)}>Anywhere</a>
                <span className="sep">/</span>
                <span>{place.name}</span>
              </>
            )}
            <span className="sep">/</span>
            <span>{meta.name}</span>
          </nav>
          <span className="eyebrow">Step 3 · Test · {cat.topics[meta.topic]}</span>
          <h1 style={{ marginTop: 12, maxWidth: '26ch' }}>
            {meta.name} in {placeName}
          </h1>
          <p className="verdict-line" style={{ marginTop: 18 }}>
            {sentence(a, meta, placeName)}
          </p>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'end', marginTop: 22 }}>
            <label className="field">
              <span>Variable</span>
              <select value={vid} onChange={(e) => navigate([...routeBase, e.target.value], { ...pointQ, from: from })}>
                {otherVars.map((v) => (
                  <option key={v} value={v}>
                    {cat.variables[v].name}
                  </option>
                ))}
              </select>
            </label>
            <p className="small muted" style={{ maxWidth: '60ch' }}>
              <strong style={{ color: 'var(--ink)' }}>{meta.name}:</strong> {meta.definition} <span className="mono tiny">Source: {meta.source}.</span>
            </p>
          </div>
        </div>
      </div>

      <section className="section" style={{ paddingTop: 28 }}>
        <div className="wrap">
          <div className="cards">
            <div>
              <span className="eyebrow">Rate of change</span>
              <div className="big">
                {r.value}
                <span style={{ fontSize: '0.5em', fontWeight: 500 }}> {unit}</span>
              </div>
              <div className="sub">
                per decade · 95% interval {r.low} to {r.high}
                {r.percent ? ` · ${r.percent}` : ''}
              </div>
            </div>
            <div>
              <span className="eyebrow">Significance</span>
              <div className="big">{a.mk.p < 0.001 ? 'p < 0.001' : `p = ${fmtP(a.mk.p)}`}</div>
              <div className="sub">Mann-Kendall test, corrected for year-to-year memory</div>
            </div>
            <div>
              <span className="eyebrow">Verdict</span>
              <div className="big" style={{ fontSize: '1.5rem', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <Dir slope={a.sen.slope} /> <Badge verdict={a.verdict} />
              </div>
              <div className="sub">
                {a.first}–{a.last} · {a.nYears} years{from ? ` (from ${from})` : ''}
              </div>
            </div>
            <div>
              <span className="eyebrow">Signal vs noise</span>
              <div className="big">{fmt(a.snr, 1)}×</div>
              <div className="sub">total change over the record ÷ typical year-to-year swing</div>
            </div>
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 8 }}>
        <div className="wrap">
          <div className="toolbar">
            <div className="legend">
              <span className="key">
                <span className="line" style={{ color: view === 'raw' ? '#a9a79f' : '#c3c2b7' }} />
                {view === 'raw' ? 'Monthly values as measured' : monthly ? 'Monthly, seasons removed' : 'Yearly values'}
              </span>
              {monthly && view !== 'raw' && (
                <span className="key">
                  <span className="dot" style={{ background: '#33322f' }} /> Yearly average
                </span>
              )}
              <span className="key">
                <span className="line" style={{ color: a.sen.slope >= 0 ? 'var(--rise)' : 'var(--fall)', height: 3 }} /> Theil-Sen trend
              </span>
              <span className="key">
                <span className="box" style={{ background: a.sen.slope >= 0 ? 'var(--rise-wash)' : 'var(--fall-wash)' }} /> 95% range of trends
              </span>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              {monthly && (
                <div className="seg" role="group" aria-label="Chart view">
                  <button aria-pressed={view === 'deseasonalized'} onClick={() => setQuery({ view: undefined })}>
                    Seasons removed
                  </button>
                  <button aria-pressed={view === 'raw'} onClick={() => setQuery({ view: 'raw' })}>
                    Raw monthly
                  </button>
                </div>
              )}
              <label className="small" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span className="mono tiny muted">FROM</span>
                <select value={from ?? series.start} onChange={(e) => setQuery({ from: Number(e.target.value) === series.start ? undefined : e.target.value })}>
                  {sens.map((c) => (
                    <option key={c.start} value={c.start}>
                      {c.start}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          <TimeSeriesChart
            years={axes.years}
            months={axes.months}
            raw={series.values}
            full={full}
            analysis={a}
            meta={meta}
            view={view}
            from={from}
            label={`${meta.name} in ${place.name}, ${a.first} to ${a.last}`}
          />
          <p className="small muted" style={{ marginTop: 10, maxWidth: '80ch' }}>
            {monthly
              ? view === 'raw'
                ? 'Raw monthly values swing with the seasons. The trend is tested on the yearly averages after removing that seasonal cycle.'
                : "Seasons removed: each month's long-term average for that calendar month is subtracted and the overall average added back, so the scale stays familiar. Dots are yearly averages, which is what the trend test uses."
              : 'This product is made once a year, so there is no seasonal cycle to remove. Each dot is one year.'}{' '}
            Hover the chart to read exact values.
          </p>
          <YearTable a={a} full={full} meta={meta} />
        </div>
      </section>

      <section className="section" id="sensitivity-wrap">
        <div className="wrap grid-2">
          <div id="sensitivity">
            <span className="eyebrow">Step 4 · Explain · Sensitivity check</span>
            <h3 style={{ margin: '10px 0 14px' }}>Does the verdict depend on when we start counting?</h3>
            <SensitivityStrip cells={sens} selected={from ?? series.start} unit={unit || 'units'} decimals={sd} onSelect={(st) => setQuery({ from: st === series.start ? undefined : st })} />
          </div>
          <div id="needed">
            <span className="eyebrow">Detection time</span>
            <h3 style={{ margin: '10px 0 14px' }}>How many years of data does a trend like this need?</h3>
            <YearsNeeded a={a} monthly={monthly} />
          </div>
        </div>
      </section>

      <section className="section" id="where">
        <div className="wrap">
          <span className="eyebrow">Where is it changing?</span>
          {place.kind === 'region' && place.maps[vid] ? (
            <div className="grid-2" style={{ marginTop: 10, alignItems: 'start' }}>
              <div style={{ gridColumn: 'span 1' }}>
                <h3 style={{ marginBottom: 12 }}>Trend in every {place.maps[vid].kind === 'grid' ? 'grid cell' : 'sample site'}, {series.start}–{a.last}</h3>
                <p className="small" style={{ color: 'var(--ink-2)' }}>
                  The same test is repeated for each {place.maps[vid].kind === 'grid' ? 'grid cell' : 'MODIS sample site'} on its own. Testing hundreds of
                  places at once would produce false alarms by luck alone (about 1 in 20 at the 5% level), so we apply the Benjamini–Hochberg
                  false-discovery-rate correction before marking a place as significant.
                </p>
                <p className="small muted" style={{ marginTop: 10 }}>
                  A regional trend can hide places moving the other way. If you see both blue and coral here, the region is not changing uniformly.
                </p>
              </div>
              <div>
                <TrendMap layers={[{ bbox: place.bbox!, map: place.maps[vid] }]} meta={meta} height={420} />
              </div>
            </div>
          ) : (
            <div className="grid-2" style={{ marginTop: 10 }}>
              <div>
                <h3 style={{ marginBottom: 12 }}>One grid cell, about 50 km across</h3>
                <p className="small" style={{ color: 'var(--ink-2)' }}>{place.subtitle}. Live data for a single spot has no trend map. To see where a variable rises or falls across a whole region, explore a featured region.</p>
              </div>
              <div className="map" style={{ height: 300 }}>
                <WorldMap regions={cat.regions} point={[place.lat, place.lon]} dark={false} fitTo="point" onRegion={(id) => navigate(['explore', id])} onPoint={(la, lo) => navigate(['anywhere'], { lat: la.toFixed(3), lon: lo.toFixed(3) })} />
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="section">
        <div className="wrap grid-2" style={{ alignItems: 'start' }}>
          <div>
            <span className="eyebrow">Second opinions</span>
            <h3 style={{ margin: '10px 0 14px' }}>Do other tests agree?</h3>
            <SecondOpinions a={a} monthlyP={monthlyTest?.p} meta={meta} />
          </div>
          <div id="stations">
            <span className="eyebrow">Ground truth · NOAA Climate Data Online</span>
            <h3 style={{ margin: '10px 0 14px' }}>Do weather stations agree?</h3>
            <Stations place={place} vid={vid} meta={meta} />
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap grid-2" style={{ alignItems: 'start' }}>
          <div>
            <span className="eyebrow">Take the evidence with you</span>
            <h3 style={{ margin: '10px 0 14px' }}>Data, link and citation</h3>
            <Exports place={place} vid={vid} meta={meta} a={a} full={full} />
          </div>
          <div>
            <span className="eyebrow">How this result was calculated</span>
            <ol className="steps small" style={{ marginTop: 12 }}>
              <li>
                {place.kind === 'region'
                  ? `Averaged ${meta.source.split(',')[0]} over the region's land ${place.maps[vid]?.kind === 'sites' ? 'sample sites' : 'grid cells'} for every ${monthly ? 'month' : 'year'}.`
                  : `Took the ${monthly ? 'monthly' : 'yearly'} series for this grid cell live from NASA POWER.`}
              </li>
              {monthly && <li>Removed the seasonal cycle (each calendar month's average), then averaged each year.</li>}
              <li>
                Mann-Kendall trend test on {a.nYears} yearly values. Year-to-year memory (lag-1 autocorrelation {fmt(a.mk.r1, 2)}) widened the
                uncertainty by a factor of {fmt(Math.sqrt(a.mk.factor), 2)}.
              </li>
              <li>Theil-Sen slope (the median of the slopes between every pair of years) with its 95% confidence interval.</li>
              <li>Significance level 5%: a trend is called significant when p &lt; 0.05.</li>
            </ol>
            <a className="btn ghost small arrow" href="#/method">
              Full method and validation
            </a>
          </div>
        </div>
      </section>
    </>
  )
}

function YearTable({ a, full, meta }: { a: Analysis; full: Analysis; meta: VariableMeta }) {
  const d = Math.max(meta.decimals, 1)
  return (
    <details className="method" style={{ marginTop: 14 }}>
      <summary>Table of yearly values</summary>
      <div className="table-scroll" style={{ maxHeight: 360, overflowY: 'auto' }}>
        <table className="table">
          <thead>
            <tr>
              <th>Year</th>
              <th className="num">Yearly value{unitText(meta) ? ` (${meta.unit === '%' ? '%' : unitText(meta).trim()})` : ''}</th>
              <th className="num">Trend line</th>
              <th className="num">Difference</th>
            </tr>
          </thead>
          <tbody>
            {full.annualYears.map((y, i) => {
              const v = full.annual[i]
              const used = y >= a.first && y <= a.last
              const tl = a.sen.intercept + a.sen.slope * (y + 0.5)
              return (
                <tr key={y} style={used ? undefined : { color: 'var(--faint)' }}>
                  <td className="num" style={{ textAlign: 'left' }}>
                    {y}
                    {used ? '' : ' (not used)'}
                  </td>
                  <td className="num">{fmt(v, d)}</td>
                  <td className="num">{used ? fmt(tl, d) : '–'}</td>
                  <td className="num">{used && Number.isFinite(v) ? fmt(v - tl, d, true) : '–'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </details>
  )
}

function YearsNeeded({ a, monthly }: { a: Analysis; monthly: boolean }) {
  const n = a.yearsNeeded
  if (n === null) return <p className="small">The trend is essentially zero, so no record would be long enough to detect it.</p>
  const need = Math.round(n)
  const have = a.nYears
  const pct = Math.min(100, (have / Math.max(need, have)) * 100)
  const needPct = Math.min(100, (need / Math.max(need, have)) * 100)
  return (
    <div>
      <div style={{ display: 'grid', gap: 8 }}>
        <div className="small" style={{ display: 'grid', gridTemplateColumns: '96px 1fr', alignItems: 'center', gap: 10 }}>
          <span className="mono tiny muted">WE HAVE</span>
          <span style={{ display: 'grid', gridTemplateColumns: '1fr 76px', alignItems: 'center', gap: 10 }}>
            <span>
              <span style={{ display: 'block', height: 10, width: `${pct}%`, background: 'var(--ink)', borderRadius: 1 }} />
            </span>
            <strong>{have} years</strong>
          </span>
        </div>
        <div className="small" style={{ display: 'grid', gridTemplateColumns: '96px 1fr', alignItems: 'center', gap: 10 }}>
          <span className="mono tiny muted">NEEDED ≈</span>
          <span style={{ display: 'grid', gridTemplateColumns: '1fr 76px', alignItems: 'center', gap: 10 }}>
            <span>
              <span style={{ display: 'block', height: 10, width: `${needPct}%`, boxShadow: 'inset 0 0 0 1.5px var(--ink)', borderRadius: 1 }} />
            </span>
            <strong>{need} years</strong>
          </span>
        </div>
      </div>
      <p className="small" style={{ marginTop: 14, color: 'var(--ink-2)' }}>
        {a.verdict === 'significant'
          ? `A trend this size, with this much natural noise, usually needs about ${need} years of data to show up reliably. The record is ${have} years long, ${have >= need ? 'so the detection is on solid ground.' : 'so the test found it a little earlier than expected; check the sensitivity strip.'}`
          : need <= have
            ? `By this rule of thumb ${need} years should have been enough. The test still could not rule out chance, so the trend is weaker or less steady than it looks.`
            : `At the current rate and noise level, a trend this size needs about ${need} years of data to detect. We have ${have}. If it continues at the same pace, it could become detectable around ${a.first + need - 1}.`}
      </p>
      <p className="tiny muted" style={{ marginTop: 8 }}>
        Rule of thumb from Weatherhead et al. (1998): 95% confidence with 90% probability, using the noise and lag-1 autocorrelation of the{' '}
        {monthly ? 'monthly' : 'yearly'} values after the trend is removed.
      </p>
    </div>
  )
}

function SecondOpinions({ a, monthlyP, meta }: { a: Analysis; monthlyP?: number; meta: VariableMeta }) {
  const d = decimalsFor(a.sen.slope * 10)
  const u = unitText(meta).trim()
  const rows: [string, string, string, number][] = [
    ['Mann-Kendall + Theil-Sen', 'yearly values, autocorrelation-corrected (main result)', `${fmt(a.sen.slope * 10, d, true)} ${u}`, a.mk.p],
    ['Least-squares line + t-test', 'yearly values, effective sample size for memory', `${fmt(a.ols.slope * 10, d, true)} ${u}`, a.ols.p],
  ]
  if (monthlyP !== undefined) rows.push(['Mann-Kendall', 'every month, seasons removed, autocorrelation-corrected', '–', monthlyP])
  const agree = rows.every((r) => r[3] < 0.05) || rows.every((r) => r[3] >= 0.05)
  return (
    <div>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Method</th>
              <th className="num">Per decade</th>
              <th className="num">p</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([m, sub, s, p]) => (
              <tr key={m + sub}>
                <td>
                  {m}
                  <div className="tiny muted">{sub}</div>
                </td>
                <td className="num">{s}</td>
                <td className="num">
                  {fmtP(p)} {p < 0.05 ? '✓' : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small" style={{ marginTop: 12, color: 'var(--ink-2)' }}>
        {agree
          ? `All ${rows.length} methods reach the same conclusion at the 5% level.`
          : 'The methods disagree. This is a borderline case: treat the trend as uncertain.'}{' '}
        The t-test assumes a straight line with bell-shaped noise; Mann-Kendall only asks whether values tend to go up (or down) over time, so one
        outlier year can't fool it.
      </p>
    </div>
  )
}

function Stations({ place, vid, meta }: { place: Place; vid: string; meta: VariableMeta }) {
  const [live, setLive] = useState<{ loading: boolean; data?: StationJSON; error?: string }>({ loading: false })
  if (vid !== 't2m' && vid !== 'precip')
    return <p className="small muted">Weather stations measure air temperature and rainfall directly. For {meta.name.toLowerCase()}, satellites and models are the main source, so there is no station check here.</p>
  const st = place.kind === 'region' ? place.stations[vid] : live.data
  if (place.kind === 'point' && !live.data)
    return (
      <div className="stack">
        <p className="small">Fetch the nearest long-record weather station from NOAA's Climate Data Online and compare it with NASA's MERRA-2 for the same months.</p>
        <button
          className="btn small"
          disabled={live.loading}
          onClick={() => {
            setLive({ loading: true })
            liveStationCheck(place.lat, place.lon, place, vid).then(
              (data) => setLive({ loading: false, data }),
              (e) => setLive({ loading: false, error: String(e?.message ?? e) }),
            )
          }}
        >
          {live.loading ? 'Searching stations…' : 'Check nearest station'}
        </button>
        {live.error && <p className="small error">{live.error}</p>}
      </div>
    )
  if (!st || !st.stations.length || !st.trend) return <p className="note">{st?.note ?? 'No station data.'}</p>
  const u = unitText(meta).trim()
  const T = st.trend
  return (
    <div className="stack">
      <StationChart years={st.years!} station={st.station!} model={st.merra2!} unit={u} />
      <table className="table" style={{ marginTop: 8 }}>
        <thead>
          <tr>
            <th>Source</th>
            <th className="num">Per decade</th>
            <th className="num">p</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              {st.stations.length === 1 ? st.stations[0].name : `${st.stations.length} stations`}
              <div className="tiny muted">NOAA GSOM, months with data only</div>
            </td>
            <td className="num">
              {fmt(T.station.slope, 2, true)} {u}
            </td>
            <td className="num">{fmtP(T.station.p)}</td>
          </tr>
          <tr>
            <td>
              MERRA-2
              <div className="tiny muted">same cells, same months</div>
            </td>
            <td className="num">
              {fmt(T.merra2.slope, 2, true)} {u}
            </td>
            <td className="num">{fmtP(T.merra2.p)}</td>
          </tr>
        </tbody>
      </table>
      <p className="small" style={{ color: 'var(--ink-2)' }}>
        Year-to-year agreement: correlation <strong>{fmt(st.r!, 2)}</strong>.{' '}
        {st.same_direction
          ? st.both_significant
            ? 'Both sources show a significant trend in the same direction.'
            : 'Both point the same way, but they disagree on whether the trend is significant.'
          : 'The two sources point in different directions, so treat this trend with caution.'}{' '}
        {T.station.p < 0.05 !== T.merra2.p < 0.05 && Math.abs(T.station.slope) > Math.abs(T.merra2.slope)
          ? 'Stations often sit in towns that have grown warmer than the land around them (the urban heat island), which can make station trends steeper than a 50 km model cell.'
          : ''}
      </p>
    </div>
  )
}

function Exports({ place, vid, meta, a, full }: { place: Place; vid: string; meta: VariableMeta; a: Analysis; full: Analysis }) {
  const [copied, setCopied] = useState(false)
  const s = place.series[vid]
  function csv() {
    const { years, months } = seriesAxes(s)
    const lines = [
      `# TrendLens export: ${meta.name} (${meta.unit}) for ${place.name}`,
      `# Source: ${meta.source}`,
      `# Period analysed: ${a.first}-${a.last}; Theil-Sen slope ${fmt(a.sen.slope * 10, 6)} ${meta.unit}/decade (95% CI ${fmt(a.sen.low * 10, 6)} to ${fmt(a.sen.high * 10, 6)}); Mann-Kendall p = ${a.mk.p.toPrecision(4)}; verdict: ${verdictLabel[a.verdict]}`,
      `# Method: seasonal cycle removed, yearly means, Mann-Kendall with AR(1) effective sample size, alpha = 0.05`,
      months ? 'year,month,value,deseasonalized,trend_line' : 'year,value,trend_line',
    ]
    years.forEach((y, i) => {
      const t = months ? y + (months[i] - 0.5) / 12 : y + 0.5
      const tl = a.sen.intercept + a.sen.slope * t
      const v = s.values[i]
      const vs = v === null ? '' : String(v)
      const ds = Number.isFinite(full.deseasonalized[i]) ? full.deseasonalized[i].toFixed(6) : ''
      lines.push(months ? `${y},${months[i]},${vs},${ds},${tl.toFixed(6)}` : `${y},${vs},${tl.toFixed(6)}`)
    })
    const blob = new Blob([lines.join('\n').replace(/−/g, '-')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const el = document.createElement('a')
    el.href = url
    el.download = `trendlens_${place.kind === 'region' ? place.id : 'point'}_${vid}.csv`
    el.click()
    URL.revokeObjectURL(url)
  }
  const cite = `Cosmosis TrendLens (2026). ${meta.name} trend for ${place.name}, ${a.first}–${a.last}. Data: ${meta.source}. Accessed ${new Date().toISOString().slice(0, 10)}.`
  return (
    <div className="stack">
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="btn small" onClick={csv}>
          Download CSV
        </button>
        <button
          className="btn small ghost"
          onClick={() => {
            navigator.clipboard?.writeText(window.location.href).then(() => {
              setCopied(true)
              window.setTimeout(() => setCopied(false), 2000)
            })
          }}
        >
          {copied ? 'Link copied' : 'Copy share link'}
        </button>
      </div>
      <p className="tiny muted">
        The CSV holds every {s.per_year === 12 ? 'month, the seasons-removed values' : 'year'} and the trend line, so you can redo the analysis in a spreadsheet.
      </p>
      <div className="note small" style={{ fontFamily: 'var(--mono)', fontSize: 12.5 }}>
        {cite}
      </div>
      <p className="small">
        {a.verdict === 'significant' ? 'Significant' : 'Not significant'} {pText(a.mk.p)} · <Dir slope={a.sen.slope} />
      </p>
    </div>
  )
}
