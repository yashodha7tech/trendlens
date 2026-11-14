import { useMemo, useState } from 'react'
import { Badge, Dir } from '../components/bits'
import TimeSeriesChart from '../components/TimeSeriesChart'
import { fmt, fmtP, pText } from '../lib/format'
import { useAsync, useTitle } from '../lib/hooks'
import { analyze } from '../lib/stats'
import type { Catalog, VariableMeta } from '../lib/types'

interface Validation {
  runs: number
  false_alarm: { n: number; phi: number; none: number; hamed_rao: number; ar1: number }[]
  power: { n: number; phi: number; slope: number; none: number; hamed_rao: number; ar1: number }[]
  recovery: { true_per_decade: number; mean_per_decade: number; coverage: number; runs: number }
  agreement: { series: number; max_diff_p_original: number; max_diff_p_hamed_rao: number; max_diff_sen_slope: number; max_diff_sen_interval: number }
}

const PIPELINE: [string, string][] = [
  ['Average over the region', 'For each month, average every land grid cell in the region, weighting each cell by its true area (cells shrink toward the poles). Missing values are skipped, never filled in.'],
  ['Check the record', 'Count missing months and drop any series shorter than 15 years. MERRA-2 runs 1981–2025; CERES and MODIS start in 2000–2001, so those trends cover 25–26 years.'],
  ['Remove the seasons', "Summer is always hotter than winter, and that cycle would swamp any trend. We subtract each calendar month's long-term average and add back the overall average, so the numbers keep their familiar scale."],
  ['Average each year', 'Average the seasons-removed months into one value per year. Yearly values carry far less short-term memory than monthly ones, which keeps the test honest. Steps 3–4 follow the monthly-anomaly method of Acker et al. (2009).'],
  ['Test for a trend', 'The Mann-Kendall test asks one question: across all pairs of years, does the later year tend to be higher (or lower) than the earlier one? It needs no straight-line or bell-curve assumptions.'],
  ['Correct for memory', 'A warm year is often followed by another warm year. That memory (autocorrelation) makes random wiggles look like trends, so we shrink the effective number of independent years before computing the p-value (Yue & Wang, 2004).'],
  ['Measure the rate', 'The Theil-Sen slope is the median of the slopes between every pair of years. It is robust to outliers, and its 95% confidence interval (Sen, 1968) uses the same memory-corrected variance as the test.'],
  ['Report it honestly', 'p < 0.05 → significant. Otherwise we report the tendency and estimate how many years of data a trend that size would need (Weatherhead et al., 1998).'],
  ['Map it fairly', 'Each grid cell is tested on its own. Then the Benjamini–Hochberg procedure controls the false-discovery rate at 5%, so maps are not speckled with chance "significant" cells (Wilks, 2016).'],
]

const GLOSSARY: [string, string][] = [
  ['Trend', 'A steady change in one direction over many years: rising, falling, thickening, thinning.'],
  ['p-value', 'If there were really no trend, how often would random year-to-year noise produce a pattern at least this strong? p = 0.03 means about 3 times in 100.'],
  ['Significant', 'p is below 0.05, our pre-chosen threshold. It means "unlikely to be chance", not "large" or "important".'],
  ['95% confidence interval', 'The range of trend rates that fit the data. If it includes zero, the data cannot rule out "no change".'],
  ['Autocorrelation', "Memory in a series: this year's value is related to last year's. It fools simple tests into seeing trends that aren't there."],
  ['Seasonal cycle', 'The regular up-and-down within each year (summer heat, monsoon rain). It is removed before testing for a long-term trend.'],
  ['False discovery rate', 'When you run hundreds of tests, about 5% pass by luck at the 5% level. FDR control keeps the share of false alarms among the "significant" ones low.'],
  ['Reanalysis', 'A model such as MERRA-2 that blends millions of satellite and ground observations into a complete, consistent picture of the atmosphere and land.'],
]

const PRACTICE: VariableMeta = {
  name: 'Practice variable',
  short: 'Practice',
  topic: 'heat',
  unit: 'units',
  decimals: 2,
  definition: 'Synthetic data with a trend you choose.',
  source: 'your browser',
  instrument: '',
  start: 1981,
  land_only: false,
  agg: 'annual',
}

export default function Method({ cat }: { cat: Catalog }) {
  useTitle('Method')
  const val = useAsync<Validation>(() => fetch('/data/validation.json').then((r) => r.json()), [])
  return (
    <>
      <div className="page-head">
        <div className="wrap">
          <span className="eyebrow">Method</span>
          <h1 style={{ marginTop: 12 }}>How TrendLens decides whether a change is real</h1>
          <p className="lede">
            Every number on this site comes from the same nine steps, run on real NASA data. The statistics run in two independent implementations,
            Python for the cached regions and TypeScript in your browser, and both are checked against trusted libraries.
          </p>
        </div>
      </div>

      <section className="section">
        <div className="wrap">
          <div className="section-head">
            <h2>The pipeline</h2>
          </div>
          <div className="grid-3" style={{ rowGap: 0 }}>
            {PIPELINE.map(([t, d], i) => (
              <div className="step" key={t}>
                <span className="n">{String(i + 1).padStart(2, '0')}</span>
                <h3>{t}</h3>
                <p>{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section" id="lab">
        <div className="wrap">
          <div className="section-head">
            <div>
              <span className="eyebrow">Practice lab</span>
              <h2>Train your detective instincts</h2>
            </div>
            <p className="small muted" style={{ maxWidth: '52ch' }}>
              Make fake data where you know the true answer. See how trend size, noise, record length and memory decide whether the test can find it.
            </p>
          </div>
          <Lab />
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="section-head">
            <div>
              <span className="eyebrow">Validation</span>
              <h2>Does the method work?</h2>
            </div>
          </div>
          {val.data ? <ValidationTables v={val.data} /> : <p className="muted">Loading validation results…</p>}
        </div>
      </section>

      <section className="section">
        <div className="wrap grid-2" style={{ alignItems: 'start' }}>
          <div>
            <span className="eyebrow">Assumptions</span>
            <h3 style={{ margin: '10px 0 12px' }}>What the numbers assume</h3>
            <ul className="small" style={{ paddingLeft: 18, color: 'var(--ink-2)', display: 'grid', gap: 6 }}>
              <li>The trend is monotonic (steadily up or down) and summarised as a straight-line rate per decade.</li>
              <li>Monthly data, with the average seasonal cycle removed before testing.</li>
              <li>Year-to-year memory follows a simple first-order pattern (AR(1)).</li>
              <li>Significance level α = 0.05, two-sided, with no adjustment for looking at several variables in one region.</li>
              <li>Regional values are area-weighted averages of land cells; MODIS values are averages of nine 2 × 2 km sample sites per region.</li>
              <li>Data end in December {cat.end_year}, the last complete year.</li>
            </ul>
          </div>
          <div>
            <span className="eyebrow">Limits</span>
            <h3 style={{ margin: '10px 0 12px' }}>What we do not claim</h3>
            <ul className="small" style={{ paddingLeft: 18, color: 'var(--ink-2)', display: 'grid', gap: 6 }}>
              <li>No forecasts. A trend describes the past; it does not say what happens next.</li>
              <li>No causes. Two variables trending together does not prove one drives the other.</li>
              <li>No non-linear modelling. A rise-then-fall shows up as a weak linear trend; the start-year check helps reveal it.</li>
              <li>Model and satellite data have their own errors. That is why we compare temperature and rainfall with NOAA weather stations wherever long station records exist.</li>
              <li>Not significant does not mean no change. It means the evidence is not strong enough yet.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="section-head">
            <h2>Words a trend detective uses</h2>
          </div>
          <div className="grid-4">
            {GLOSSARY.map(([t, d]) => (
              <div className="var-card" key={t}>
                <h4>{t}</h4>
                <p className="small" style={{ color: 'var(--ink-2)' }}>
                  {d}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function Lab() {
  const [slope, setSlope] = useState(0.2)
  const [noise, setNoise] = useState(0.5)
  const [years, setYears] = useState(30)
  const [phi, setPhi] = useState(0.3)
  const [seed, setSeed] = useState(7)

  const sim = useMemo(() => {
    const r = rng(seed)
    const gauss = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r())
    const ys: number[] = []
    const vals: number[] = []
    let e = (gauss() * noise) / Math.sqrt(1 - phi * phi)
    for (let i = 0; i < years; i++) {
      if (i > 0) e = phi * e + gauss() * noise * Math.sqrt(1 - phi * phi)
      ys.push(1981 + i)
      vals.push(10 + (slope / 10) * i + e)
    }
    return { ys, vals, a: analyze(ys, vals, 1) }
  }, [slope, noise, years, phi, seed])

  const a = sim.a
  const correct = (slope !== 0) === (a.verdict === 'significant')
  return (
    <div className="grid-2" style={{ alignItems: 'start' }}>
      <div className="stack">
        <Slider label="True trend" value={slope} min={-1} max={1} step={0.05} fmt={(v) => `${fmt(v, 2, true)} units per decade`} onChange={setSlope} />
        <Slider label="Year-to-year noise" value={noise} min={0.1} max={2} step={0.05} fmt={(v) => `± ${fmt(v, 2)} units`} onChange={setNoise} />
        <Slider label="Length of record" value={years} min={10} max={60} step={1} fmt={(v) => `${v} years`} onChange={setYears} />
        <Slider label="Memory (lag-1 autocorrelation)" value={phi} min={0} max={0.8} step={0.05} fmt={(v) => fmt(v, 2)} onChange={setPhi} />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn small" onClick={() => setSeed((s) => s + 1)}>
            New random draw
          </button>
          <button className="btn small ghost" onClick={() => setSlope(0)}>
            Set true trend to zero
          </button>
        </div>
        <div className="note small">
          <strong>Found:</strong> <Dir slope={a.sen.slope} /> {fmt(a.sen.slope * 10, 2, true)} units per decade (95% interval {fmt(a.sen.low * 10, 2, true)} to{' '}
          {fmt(a.sen.high * 10, 2, true)}), {pText(a.mk.p)} <Badge verdict={a.verdict} />
          <div style={{ marginTop: 6 }}>
            {slope === 0
              ? a.verdict === 'significant'
                ? 'A false alarm: there is no real trend, yet chance produced a "significant" result. At the 5% level this happens about 1 time in 20.'
                : 'Correct: there is no trend, and the test did not invent one.'
              : correct
                ? 'The test found the real trend.'
                : 'A miss: the trend is real, but the noise hides it. Try more years or less noise.'}
          </div>
        </div>
      </div>
      <div>
        <TimeSeriesChart years={sim.ys} raw={sim.vals} full={a} analysis={a} meta={PRACTICE} view="deseasonalized" height={300} label="Synthetic practice series" />
      </div>
    </div>
  )
}

function Slider(props: { label: string; value: number; min: number; max: number; step: number; fmt: (v: number) => string; onChange: (v: number) => void }) {
  return (
    <label className="field">
      <span>
        {props.label} · <strong style={{ color: 'var(--ink)' }}>{props.fmt(props.value)}</strong>
      </span>
      <input type="range" min={props.min} max={props.max} step={props.step} value={props.value} onChange={(e) => props.onChange(Number(e.target.value))} />
    </label>
  )
}

function pct(v: number) {
  return `${(v * 100).toFixed(1)}%`
}

function ValidationTables({ v }: { v: Validation }) {
  return (
    <div className="stack" style={{ gap: 28, display: 'grid' }}>
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div>
          <h3>False alarms when there is no trend</h3>
          <p className="small muted" style={{ margin: '6px 0 12px' }}>
            {v.runs.toLocaleString()} random series per row with no trend at all. A good 5% test should flag about 5%.
          </p>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Years</th>
                  <th>Memory</th>
                  <th className="num">Plain MK</th>
                  <th className="num">Hamed–Rao</th>
                  <th className="num">TrendLens</th>
                </tr>
              </thead>
              <tbody>
                {v.false_alarm.map((r) => (
                  <tr key={`${r.n}-${r.phi}`}>
                    <td>{r.n}</td>
                    <td>{r.phi.toFixed(1)}</td>
                    <td className="num">{pct(r.none)}</td>
                    <td className="num">{pct(r.hamed_rao)}</td>
                    <td className="num">
                      <strong>{pct(r.ar1)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <h3>Finding a real trend</h3>
          <p className="small muted" style={{ margin: '6px 0 12px' }}>
            Same setting with a true trend of 0.4 noise units per decade. Higher is better, but not at the cost of false alarms.
          </p>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Years</th>
                  <th>Memory</th>
                  <th className="num">Plain MK</th>
                  <th className="num">Hamed–Rao</th>
                  <th className="num">TrendLens</th>
                </tr>
              </thead>
              <tbody>
                {v.power.map((r) => (
                  <tr key={`${r.n}-${r.phi}`}>
                    <td>{r.n}</td>
                    <td>{r.phi.toFixed(1)}</td>
                    <td className="num">{pct(r.none)}</td>
                    <td className="num">{pct(r.hamed_rao)}</td>
                    <td className="num">
                      <strong>{pct(r.ar1)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <p style={{ maxWidth: '80ch', color: 'var(--ink-2)' }}>
        <strong style={{ color: 'var(--ink)' }}>Our choice:</strong> with memory in the data, the plain test raises false alarms up to{' '}
        {pct(Math.max(...v.false_alarm.map((r) => r.none)))} of the time and the popular Hamed–Rao correction up to{' '}
        {pct(Math.max(...v.false_alarm.map((r) => r.hamed_rao)))}. TrendLens's correction stays at or below {pct(Math.max(...v.false_alarm.map((r) => r.ar1)))}. The price is
        that weak trends in short, noisy records take longer to confirm. For a tool that tells students whether a change is real, we think a
        cautious "not yet" is better than an overconfident "yes".
      </p>
      <div className="grid-3">
        <div className="case">
          <span className="eyebrow">Known-answer test</span>
          <div className="stat">
            {fmt(v.recovery.mean_per_decade, 3)} <span className="muted" style={{ fontSize: 15 }}>found vs {fmt(v.recovery.true_per_decade, 2)} true</span>
          </div>
          <p className="small muted">
            Average slope from {v.recovery.runs} synthetic 45-year monthly series with seasons and memory. The 95% interval contained the true value{' '}
            {pct(v.recovery.coverage)} of the time.
          </p>
        </div>
        <div className="case">
          <span className="eyebrow">Trusted libraries</span>
          <div className="stat">{v.agreement.max_diff_p_original < 1e-9 ? 'Exact match' : fmt(v.agreement.max_diff_p_original, 10)}</div>
          <p className="small muted">
            Largest difference from pymannkendall (Mann-Kendall p-values, Hamed–Rao, Sen's slope) and scipy (Theil-Sen interval) across {v.agreement.series}{' '}
            random series.
          </p>
        </div>
        <div className="case">
          <span className="eyebrow">Two implementations</span>
          <div className="stat">Python = browser</div>
          <p className="small muted">
            An automated test recomputes every published regional result in TypeScript and checks it against the Python pipeline to six decimal places.
          </p>
        </div>
      </div>
      <p className="tiny muted">
        Reproduce: <span className="mono">pipeline/simulate.py</span>, <span className="mono">pipeline/test_stats.py</span> and{' '}
        <span className="mono">src/lib/stats.test.ts</span> in the project repository. p-values shown as {fmtP(0.0004)} when below 0.001.
      </p>
    </div>
  )
}
