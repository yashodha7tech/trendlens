import { useMemo } from 'react'
import { Badge, Dir, ErrorBox, Loading } from '../components/bits'
import Radar, { rankItems } from '../components/Radar'
import TrendMap from '../components/TrendMap'
import { analyzeSeries, loadRegionPlace } from '../lib/data'
import { pText, rate, verdictLabel } from '../lib/format'
import { useAsync, useTitle } from '../lib/hooks'
import { href, setQuery } from '../lib/router'
import type { Analysis } from '../lib/stats'
import type { Catalog, TopicId } from '../lib/types'

interface Props {
  cat: Catalog
  region?: string
  topic?: string
  variable?: string
}

export default function Explore({ cat, region, topic, variable }: Props) {
  if (!region) return <RegionChooser cat={cat} />
  return <RegionRadar cat={cat} region={region} topic={(topic as TopicId) ?? 'all'} variable={variable} />
}

function RegionChooser({ cat }: { cat: Catalog }) {
  useTitle('Explore')
  return (
    <>
      <div className="page-head">
        <div className="wrap">
          <span className="eyebrow">Step 1 · Ask</span>
          <h1 style={{ marginTop: 12 }}>Where do you want to investigate?</h1>
          <p className="lede">
            Six featured regions with cached NASA data and per-cell trend maps. Each one was picked because something interesting happens there.
            For any other spot on Earth, use{' '}
            <a href="#/anywhere">Anywhere</a>.
          </p>
        </div>
      </div>
      <section className="section">
        <div className="wrap">
          <div className="region-cards">
            {Object.entries(cat.regions).map(([id, r]) => {
              const res = Object.values(cat.results[id] ?? {})
              const sig = res.filter((s) => s.verdict === 'significant').length
              return (
                <a key={id} className="region-card" href={href(['explore', id])}>
                  <span className="eyebrow">{r.country}</span>
                  <h3>{r.name}</h3>
                  <p className="small" style={{ color: 'var(--ink-2)' }}>
                    {r.why}
                  </p>
                  <p className="small">
                    <strong>{sig}</strong> of {res.length} variables show a significant trend
                  </p>
                </a>
              )
            })}
          </div>
        </div>
      </section>
    </>
  )
}

function RegionRadar({ cat, region, topic, variable }: { cat: Catalog; region: string; topic: TopicId | 'all'; variable?: string }) {
  const place = useAsync(() => loadRegionPlace(cat, region), [region])
  const reg = cat.regions[region]
  useTitle(reg ? `${reg.name} · Trend Radar` : 'Explore')

  const analyses = useMemo(() => {
    if (!place.data) return null
    const out: Record<string, Analysis> = {}
    for (const [vid, s] of Object.entries(place.data.series)) out[vid] = analyzeSeries(s)
    return out
  }, [place.data])
  const items = useMemo(() => (analyses ? rankItems(analyses) : []), [analyses])

  if (!reg) return <ErrorBox message={`Unknown region "${region}".`} />
  if (place.error) return <ErrorBox message={place.error} />
  if (!place.data || !analyses) return <Loading what={`Loading ${reg.name}`} />

  const visible = items.filter((it) => topic === 'all' || cat.variables[it.id].topic === topic)
  const sel = variable && analyses[variable] ? variable : visible[0]?.id ?? items[0]?.id
  const selA = analyses[sel]
  const meta = cat.variables[sel]
  const map = place.data.maps[sel]
  const nSig = items.filter((i) => i.a.verdict === 'significant').length
  const [lat0, lat1, lon0, lon1] = reg.bbox

  return (
    <>
      <div className="page-head">
        <div className="wrap">
          <nav className="crumbs small" aria-label="Breadcrumb">
            <a href="#/explore">Explore</a>
            <span className="sep">/</span>
            <span>{reg.name}</span>
          </nav>
          <span className="eyebrow">Step 2 · Find · Trend Radar</span>
          <h1 style={{ marginTop: 12 }}>What is changing in the {reg.name}?</h1>
          {region === 'prairies' && (
            <p className="small" style={{ marginTop: 10 }}>
              Canadian data and context:{' '}
              <a href="https://geo.ca/" target="_blank" rel="noreferrer">GEO.ca</a> ·{' '}
              <a href="https://www.asc-csa.gc.ca/eng/satellites/everyday-lives/monitoring-and-protecting-our-ecosystems-from-space.asp" target="_blank" rel="noreferrer">
                CSA: monitoring ecosystems from space
              </a>{' '}
              · <a href="https://donnees-data.asc-csa.gc.ca/en/dataset/rcm" target="_blank" rel="noreferrer">RADARSAT Constellation Mission data</a>
            </p>
          )}
          <p className="lede">{reg.why}</p>
          <dl className="kv" style={{ marginTop: 18 }}>
            <dt>Area</dt>
            <dd>
              {reg.country} · {Math.abs(lat0)}°–{Math.abs(lat1)}°{lat0 < 0 ? 'S' : 'N'}, {Math.abs(lon0)}°–{Math.abs(lon1)}°{lon0 < 0 ? 'W' : 'E'} ·{' '}
              {reg.biome}
            </dd>
            <dt>Result</dt>
            <dd>
              <strong>{nSig}</strong> of {items.length} variables show a statistically significant trend.
            </dd>
          </dl>
        </div>
      </div>
      <section className="section">
        <div className="wrap explore">
          <div>
            <div className="toolbar">
              <div className="chips" role="group" aria-label="Filter by topic">
                <button className="chip" aria-pressed={topic === 'all'} onClick={() => setQuery({ topic: undefined })}>
                  All
                </button>
                {(Object.entries(cat.topics) as [TopicId, string][]).map(([id, label]) => (
                  <button key={id} className="chip" aria-pressed={topic === id} onClick={() => setQuery({ topic: id, v: undefined })}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <p className="small muted" style={{ marginBottom: 10 }}>
              Ranked by how far each variable moved over its record compared with its normal year-to-year swings. Select a row to map it.
            </p>
            <Radar cat={cat} items={items} topic={topic} selected={sel} onSelect={(id) => setQuery({ v: id })} />
          </div>
          <div className="sticky-col">
            {selA && meta && (
              <div className="stack">
                <span className="eyebrow">Where is it changing?</span>
                <h3>
                  {meta.name}: <Dir slope={selA.sen.slope} /> {rate(selA, meta).perDecade}
                </h3>
                <p className="small" style={{ color: 'var(--ink-2)' }}>
                  <Badge verdict={selA.verdict} /> <span style={{ marginLeft: 6 }}>{verdictLabel[selA.verdict]} for the region as a whole, {pText(selA.mk.p)}.</span>
                </p>
                {map ? <TrendMap layers={[{ bbox: reg.bbox, map }]} meta={meta} height={400} /> : <p className="note">No map for this variable.</p>}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <a className="btn arrow" href={href(['trend', region, sel])}>
                    Test this trend
                  </a>
                  <a className="btn ghost" href={href(['compare', sel, region])}>
                    Compare with another region
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  )
}
