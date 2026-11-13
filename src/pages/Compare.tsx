import { useMemo } from 'react'
import { Badge, Dir, ErrorBox, Loading } from '../components/bits'
import TimeSeriesChart from '../components/TimeSeriesChart'
import TrendMap from '../components/TrendMap'
import { analyzeSeries, loadRegionPlace, seriesAxes } from '../lib/data'
import { decimalsFor, fmt, pText, rate, sentence, unitText } from '../lib/format'
import { useAsync, useTitle } from '../lib/hooks'
import { href, navigate } from '../lib/router'
import type { Catalog, Place } from '../lib/types'

/** General processes that can push the same variable in opposite directions in two places. */
const PROCESSES: Record<string, string> = {
  sun: 'Sunlight at the ground depends on clouds and haze. Where air pollution grows, particles scatter and absorb more sunlight before it reaches the ground ("dimming"); where pollution is cleaned up, sunlight recovers ("brightening"). The same process, aerosols blocking light, can push the numbers up in one place and down in another.',
  aod: 'Haze comes from industry, traffic, crop burning, wildfires and desert dust. Two regions can follow opposite paths when their emissions, fire seasons or clean-air rules change in different ways.',
  precip: 'Rain belts move. Shifts in monsoons, storm tracks or the tropical rain band can take rainfall away from one region and bring it to another. A warmer atmosphere also holds more water vapour, so some places get wetter while others get drier.',
  t2m: 'Warming is global, but local changes in clouds, haze, irrigation and land cover can speed it up in one place and hold it back in another.',
  soil: 'Soil wetness is a balance between rain coming in and evaporation going out. More rain can wet the soil in one region while heat and drought dry it out in another.',
  evap: 'Evaporation needs both energy and water. In wet places, extra heat means more evaporation; in dry places, less water means less evaporation, even when it gets hotter.',
  ndvi: 'Plants respond to water, heat, farming and land clearing. Irrigation or returning rains can green one region while drought or forest loss browns another.',
  tree: 'Tree cover falls where forests are cleared and rises where trees grow back on farms, plantations or abandoned land.',
}

interface Props {
  cat: Catalog
  variable?: string
  a?: string
  b?: string
}

export default function Compare({ cat, variable, a, b }: Props) {
  const vid = variable && cat.variables[variable] ? variable : 'sun'
  const ids = Object.keys(cat.regions)
  const ra = a && cat.regions[a] ? a : 'igp'
  const rb = b && cat.regions[b] && b !== ra ? b : ids.find((x) => x !== ra && x === 'ncp') ?? ids.find((x) => x !== ra)!
  const meta = cat.variables[vid]
  useTitle(`Compare ${meta.name}`)
  const places = useAsync(() => Promise.all([loadRegionPlace(cat, ra), loadRegionPlace(cat, rb)]), [ra, rb])

  // variables whose significant trends point in opposite directions in different regions
  const opposites = useMemo(() => {
    const out: { v: string; ups: string[]; downs: string[] }[] = []
    for (const v of Object.keys(cat.variables)) {
      const sig = ids.filter((r) => cat.results[r]?.[v]?.verdict === 'significant')
      const bySnr = (x: string, y: string) => cat.results[y][v].snr - cat.results[x][v].snr
      const ups = sig.filter((r) => cat.results[r][v].slope > 0).sort(bySnr)
      const downs = sig.filter((r) => cat.results[r][v].slope < 0).sort(bySnr)
      if (ups.length && downs.length) out.push({ v, ups, downs })
    }
    return out
  }, [cat, ids])
  const nPairs = opposites.reduce((n, o) => n + o.ups.length * o.downs.length, 0)

  return (
    <>
      <div className="page-head">
        <div className="wrap">
          <span className="eyebrow">Step 4 · Explain · Opposite regional trends</span>
          <h1 style={{ marginTop: 12 }}>One variable, two places, two directions?</h1>
          <p className="lede">
            A measured variable can rise in one region and fall in another, even when the same process drives both. Pick a variable and two regions
            to see whether their trends agree.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 22 }}>
            <label className="field">
              <span>Variable</span>
              <select value={vid} onChange={(e) => navigate(['compare', e.target.value, ra, rb])}>
                {Object.entries(cat.variables).map(([id, v]) => (
                  <option key={id} value={id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Region A</span>
              <select value={ra} onChange={(e) => navigate(['compare', vid, e.target.value, e.target.value === rb ? ra : rb])}>
                {ids.map((id) => (
                  <option key={id} value={id}>
                    {cat.regions[id].name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Region B</span>
              <select value={rb} onChange={(e) => navigate(['compare', vid, e.target.value === ra ? rb : ra, e.target.value])}>
                {ids.map((id) => (
                  <option key={id} value={id} disabled={id === ra}>
                    {cat.regions[id].name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </div>
      {places.error && <ErrorBox message={places.error} />}
      {!places.data ? (
        <Loading />
      ) : (
        <ComparePanels cat={cat} vid={vid} pa={places.data[0]} pb={places.data[1]} />
      )}
      <section className="section">
        <div className="wrap">
          <div className="section-head">
            <div>
              <span className="eyebrow">Opposite-trend finder</span>
              <h2>Every variable moving in opposite directions</h2>
            </div>
            <p className="small muted" style={{ maxWidth: '50ch' }}>
              Found automatically from the published results: both trends significant, one rising and one falling, over the same years.{' '}
              {nPairs} region pairs across {opposites.length} of {Object.keys(cat.variables).length} variables.
            </p>
          </div>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Variable</th>
                  <th>Rising, significant</th>
                  <th>Falling, significant</th>
                </tr>
              </thead>
              <tbody>
                {opposites.map((o) => {
                  const u = unitText(cat.variables[o.v]).trim()
                  const item = (r: string, other: string) => {
                    const s = cat.results[r][o.v]
                    return (
                      <a key={r} href={href(['compare', o.v, r, other])} title={`Compare ${cat.regions[r].name} with ${cat.regions[other].name}`}>
                        <Dir slope={s.slope} word={false} /> {cat.regions[r].name}{' '}
                        <span className="muted small">
                          {fmt(s.slope, decimalsFor(s.slope), true)}
                          {u ? ` ${u}` : ''}
                        </span>
                      </a>
                    )
                  }
                  return (
                    <tr key={o.v}>
                      <td>
                        <a href={href(['compare', o.v, o.ups[0], o.downs[0]])}>{cat.variables[o.v].name}</a>
                        <div className="tiny muted">per decade</div>
                      </td>
                      <td>
                        <div className="pair-list">{o.ups.map((r) => item(r, o.downs[0]))}</div>
                      </td>
                      <td>
                        <div className="pair-list">{o.downs.map((r) => item(r, o.ups[0]))}</div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </>
  )
}

function ComparePanels({ cat, vid, pa, pb }: { cat: Catalog; vid: string; pa: Place; pb: Place }) {
  const meta = cat.variables[vid]
  const sa = pa.series[vid]
  const sb = pb.series[vid]
  const A = useMemo(() => (sa ? analyzeSeries(sa) : null), [sa])
  const B = useMemo(() => (sb ? analyzeSeries(sb) : null), [sb])
  if (!A || !B || !sa || !sb) return <ErrorBox message={`${meta.name} is not available for both regions.`} />
  const opposite = Math.sign(A.sen.slope) !== Math.sign(B.sen.slope)
  const bothSig = A.verdict === 'significant' && B.verdict === 'significant'
  const ax = seriesAxes(sa)
  const bx = seriesAxes(sb)
  let headline: string
  if (opposite && bothSig) headline = `Opposite directions, both significant: ${meta.name.toLowerCase()} is ${A.sen.slope > 0 ? 'rising' : 'falling'} in the ${pa.name} and ${B.sen.slope > 0 ? 'rising' : 'falling'} in the ${pb.name}.`
  else if (opposite) headline = `The trends point in opposite directions, but at least one of them is not significant, so we can't be sure they really diverge.`
  else headline = `Both regions move the same way (${A.sen.slope > 0 ? 'rising' : 'falling'}), so there is no divergence for this variable.`
  return (
    <>
      <section className="section">
        <div className="wrap">
          <p className="verdict-line">{headline}</p>
          <div className="grid-2" id="compare-charts" style={{ marginTop: 26 }}>
            {[
              [pa, A, sa, ax],
              [pb, B, sb, bx],
            ].map(([p, an, s, axes]: any) => (
              <div key={p.id} className="stack">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <h3>{p.name}</h3>
                  <span>
                    <Dir slope={an.sen.slope} /> <Badge verdict={an.verdict} />
                  </span>
                </div>
                <p className="small" style={{ color: 'var(--ink-2)' }}>
                  <strong>{rate(an, meta).perDecade}</strong> · 95% interval {rate(an, meta).low} to {rate(an, meta).high} · {pText(an.mk.p)}
                </p>
                <TimeSeriesChart years={axes.years} months={axes.months} raw={s.values} full={an} analysis={an} meta={meta} view="deseasonalized" height={260} />
                <p className="small muted">{sentence(an, meta, `the ${p.name}`)}</p>
                <a className="small" href={href(['trend', p.id, vid])}>
                  Full test for the {p.name} →
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="section">
        <div className="wrap grid-2" style={{ alignItems: 'start' }}>
          <div>
            <span className="eyebrow">Same process, different directions</span>
            <h3 style={{ margin: '10px 0 12px' }}>What can push {meta.name.toLowerCase()} in opposite directions?</h3>
            <p style={{ color: 'var(--ink-2)' }}>{PROCESSES[vid]}</p>
            <p className="small muted" style={{ marginTop: 14 }}>
              TrendLens measures trends; it does not prove causes. These are processes scientists study, offered as leads for your own investigation.
            </p>
          </div>
          <div id="compare-map">
            {pa.maps[vid] && pb.maps[vid] && (
              <TrendMap
                layers={[
                  { bbox: pa.bbox!, map: pa.maps[vid], label: pa.name },
                  { bbox: pb.bbox!, map: pb.maps[vid], label: pb.name },
                ]}
                meta={meta}
                height={420}
              />
            )}
          </div>
        </div>
      </section>
    </>
  )
}
