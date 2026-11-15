import { useEffect, useMemo, useState } from 'react'
import { Dir, ErrorBox } from '../components/bits'
import GlobeLoader, { featuredRegions, parseLatLon, prefersReducedMotion, webglSupported } from '../components/GlobeLoader'
import Radar, { rankItems } from '../components/Radar'
import WorldMap from '../components/WorldMap'
import { analyzeSeries, formatLatLon, geocode, loadPoint } from '../lib/data'
import { rate, sentence, unitText } from '../lib/format'
import { useAsync, useTitle } from '../lib/hooks'
import { href, navigate } from '../lib/router'
import type { Analysis } from '../lib/stats'
import type { Catalog, Place } from '../lib/types'

type View = 'globe' | 'map'
const VIEW_KEY = 'trendlens.anywhere.view'

function startView(): View {
  if (!webglSupported()) return 'map'
  try {
    return localStorage.getItem(VIEW_KEY) === 'map' ? 'map' : 'globe'
  } catch {
    return 'globe'
  }
}

/** One analysis per fetched place, shared by the result card and the radar. */
const analysesCache = new WeakMap<Place, Record<string, Analysis>>()
function analysesFor(p: Place): Record<string, Analysis> {
  let out = analysesCache.get(p)
  if (!out) {
    out = {}
    for (const [vid, s] of Object.entries(p.series)) out[vid] = analyzeSeries(s)
    analysesCache.set(p, out)
  }
  return out
}

export default function Anywhere({ cat, query }: { cat: Catalog; query: URLSearchParams }) {
  const lat = query.get('lat') !== null ? Number(query.get('lat')) : null
  const lon = query.get('lon') !== null ? Number(query.get('lon')) : null
  const name = query.get('name') ?? undefined
  const wanted = query.get('v') ?? undefined
  const has = lat !== null && lon !== null && Number.isFinite(lat) && Number.isFinite(lon)
  useTitle(has ? `Anywhere · ${name ?? formatLatLon(lat!, lon!)}` : 'Anywhere')
  const [q, setQ] = useState('')
  const [msg, setMsg] = useState('')
  const canGlobe = webglSupported()
  const [view, setView] = useState<View>(startView)
  const [globeNote, setGlobeNote] = useState('')
  const regions = useMemo(() => featuredRegions(cat), [cat])
  const point = useMemo<[number, number] | null>(() => (has ? [lat!, lon!] : null), [has, lat, lon])
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches

  function choose(v: View) {
    setView(v)
    setGlobeNote('')
    try {
      localStorage.setItem(VIEW_KEY, v)
    } catch {
      /* storage unavailable: the choice lasts for this visit only */
    }
  }

  const pick = (la: number, lo: number) => navigate(['anywhere'], { lat: la.toFixed(3), lon: lo.toFixed(3) })

  async function search(e: React.FormEvent) {
    e.preventDefault()
    if (!q.trim()) return
    const ll = parseLatLon(q)
    if (ll) {
      setMsg('')
      return pick(ll[0], ll[1])
    }
    setMsg('Searching…')
    try {
      const g = await geocode(q.trim())
      if (!g) return setMsg(`No place called "${q}" found.`)
      setMsg('')
      navigate(['anywhere'], { lat: g.lat.toFixed(3), lon: g.lon.toFixed(3), name: g.name })
    } catch {
      setMsg(`Place search is unavailable. ${view === 'globe' ? 'Click the globe' : 'Click the map'} or type coordinates instead.`)
    }
  }

  // After a failed NASA POWER request, "Try again" remounts the card and the radar so both fetch afresh
  // (loadPoint drops failed requests from its cache).
  const [attempt, setAttempt] = useState(0)
  const card = has ? <PickCard key={attempt} cat={cat} lat={lat!} lon={lon!} name={name} onRetry={() => setAttempt((n) => n + 1)} /> : null

  return (
    <>
      <div className="page-head any-head on-dark">
        <div className="wrap any-grid">
          <div className="any-copy">
            <span className="eyebrow">Live mode · NASA POWER</span>
            <h1 style={{ marginTop: 12 }}>Investigate any spot on Earth</h1>
            <p className="lede">
              {view === 'globe' ? 'Spin the globe and pick any place, or search for one.' : 'Click the map or search for a place.'} TrendLens fetches 25 to
              45 years of monthly NASA data for that grid cell straight from NASA POWER and runs every test in your browser.
            </p>
          </div>
          <div className="any-tools">
            <form className="qbox" role="search" onSubmit={search}>
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Town, region or coordinates"
                aria-label="Place name or coordinates"
                aria-describedby="any-tip"
              />
              <button className="btn" type="submit">
                Search
              </button>
            </form>
            <div className="any-row">
              {'geolocation' in navigator && (
                <button
                  className="btn small ghost on-dark"
                  onClick={() =>
                    navigator.geolocation.getCurrentPosition(
                      (p) => navigate(['anywhere'], { lat: p.coords.latitude.toFixed(3), lon: p.coords.longitude.toFixed(3), name: 'Your location' }),
                      () => setMsg('Location permission was not granted.'),
                    )
                  }
                >
                  Use my location
                </button>
              )}
              <span className="any-msg" aria-live="polite">
                {msg}
              </span>
            </div>
            <p className="any-tip" id="any-tip">
              Coordinates work too: type latitude, longitude such as <span className="mono">12.97, 77.59</span> or <span className="mono">33.4S 70.6W</span>.
            </p>
            <ol className="any-steps" aria-label="What happens when you pick a place">
              <li>
                <span>
                  <strong>Pick a spot</strong> anywhere on land or sea.
                </span>
              </li>
              <li>
                <span>
                  <strong>NASA data arrives:</strong> monthly NASA POWER records for that grid cell, from 1981 on.
                </span>
              </li>
              <li>
                <span>
                  <strong>Every variable is tested</strong> for a trend (Mann-Kendall) and its rate is measured (Theil-Sen), right in your browser.
                </span>
              </li>
            </ol>
          </div>
          <div className="any-stage">
            <div className="any-bar">
              <span className="any-hint">
                {view === 'globe'
                  ? `${coarse ? 'Tap' : 'Click'} anywhere on Earth to investigate it. Outlined boxes are the featured regions.`
                  : 'Click the map to investigate a spot, or a box to explore a featured region.'}
              </span>
              <div className="any-toggle" role="group" aria-label="Choose how to pick a place">
                <button
                  type="button"
                  aria-pressed={view === 'globe'}
                  disabled={!canGlobe}
                  title={canGlobe ? undefined : 'The 3D globe needs WebGL, which this browser does not provide'}
                  onClick={() => choose('globe')}
                >
                  Globe
                </button>
                <button type="button" aria-pressed={view === 'map'} onClick={() => choose('map')}>
                  Map
                </button>
              </div>
            </div>
            {view === 'globe' ? (
              <GlobeLoader
                regions={regions}
                point={point}
                pointLabel={name}
                onPick={pick}
                onFail={(why) => {
                  console.warn('[globe] falling back to the flat map:', why)
                  setView('map')
                  setGlobeNote('The 3D globe could not start in this browser, so the flat map is shown instead.')
                }}
              >
                {card}
              </GlobeLoader>
            ) : (
              <>
                <div className="map any-map">
                  <WorldMap
                    regions={cat.regions}
                    dark={false}
                    point={point}
                    fitTo="point"
                    onRegion={(id) => navigate(['explore', id])}
                    onPoint={(la, lo) => navigate(['anywhere'], { lat: la.toFixed(3), lon: lo.toFixed(3) })}
                  />
                </div>
                {!canGlobe && <p className="any-note">The 3D globe needs WebGL, which this browser does not provide, so the flat map is shown.</p>}
                {globeNote && <p className="any-note">{globeNote}</p>}
                {card}
              </>
            )}
          </div>
        </div>
      </div>
      {has ? (
        <div id="any-results" key={attempt}>
          <PointRadar cat={cat} lat={lat!} lon={lon!} name={name} wanted={wanted} />
        </div>
      ) : (
        <Suggestions />
      )}
    </>
  )
}

/** The picked point and the headline of its live result, next to the globe. */
function PickCard({ cat, lat, lon, name, onRetry }: { cat: Catalog; lat: number; lon: number; name?: string; onRetry: () => void }) {
  // Tagged with the point it was fetched for, so a new pick never shows the previous spot's numbers.
  // (loadPoint shares its fetch with the radar below and may return a cached neighbour within 0.01°.)
  const key = `${lat},${lon}`
  const [res, setRes] = useState<{ key: string; place?: Place; error?: boolean }>()
  useEffect(() => {
    let live = true
    loadPoint(cat, lat, lon, name).then(
      (p) => live && setRes({ key, place: p }),
      () => live && setRes({ key, error: true }),
    )
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  const place = res?.key === key ? res : undefined
  const fresh = place?.place
  const items = useMemo(() => (fresh ? rankItems(analysesFor(fresh)) : null), [fresh])
  const sig = items?.filter((i) => i.a.verdict === 'significant') ?? []
  const top = sig[0]
  const meta = top ? cat.variables[top.id] : undefined
  const r = top && meta ? rate(top.a, meta) : undefined
  const toResults = () =>
    document.getElementById('any-results')?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
  return (
    <div className="any-pick" aria-live="polite">
      <span className="eyebrow">Investigating</span>
      <span className="any-pick-name">{name ?? formatLatLon(lat, lon)}</span>
      {name && <span className="any-pick-coords">{formatLatLon(lat, lon)}</span>}
      <p className="any-pick-status">
        {place?.error ? (
          'NASA POWER could not be reached. The network may be busy.'
        ) : !items ? (
          'Fetching monthly NASA POWER data since 1981…'
        ) : (
          <>
            <strong>
              {sig.length} of {items.length}
            </strong>{' '}
            variables show a significant trend here.
            {top && meta && r && (
              <>
                {' '}
                Strongest: {meta.name.toLowerCase()} <Dir slope={top.a.sen.slope} />, {r.value}
                {unitText(meta)} per decade.
              </>
            )}
          </>
        )}
      </p>
      {place?.error ? (
        <div className="any-pick-actions">
          <button type="button" className="btn small" onClick={onRetry}>
            Try again
          </button>
        </div>
      ) : (
        items && (
          <div className="any-pick-actions">
            <button type="button" className="btn small" onClick={toResults}>
              See the evidence ↓
            </button>
          </div>
        )
      )}
    </div>
  )
}

function Suggestions() {
  const picks: [string, number, number][] = [
    ['Bengaluru, India', 12.97, 77.59],
    ['Lake Chad', 13.1, 14.4],
    ['Phoenix, Arizona', 33.45, -112.07],
    ['Yakutsk, Siberia', 62.03, 129.73],
    ['Murray–Darling Basin, Australia', -34.0, 143.0],
    ['Madrid, Spain', 40.42, -3.7],
  ]
  return (
    <section className="section">
      <div className="wrap">
        <span className="eyebrow">Try one of these</span>
        <div className="chips" style={{ marginTop: 12 }}>
          {picks.map(([n, la, lo]) => (
            <a key={n} className="chip" style={{ textDecoration: 'none' }} href={href(['anywhere'], { lat: la, lon: lo, name: n })}>
              {n}
            </a>
          ))}
        </div>
        <p className="small muted" style={{ marginTop: 18, maxWidth: '70ch' }}>
          Live mode covers the six NASA POWER variables: air temperature, rainfall, soil wetness, evaporation, haze and surface sunlight. MODIS
          vegetation needs minutes per site to download, so it is available for the featured regions only.
        </p>
      </div>
    </section>
  )
}

function PointRadar({ cat, lat, lon, name, wanted }: { cat: Catalog; lat: number; lon: number; name?: string; wanted?: string }) {
  const place = useAsync(() => loadPoint(cat, lat, lon, name), [lat, lon])
  const analyses = useMemo(() => (place.data ? analysesFor(place.data) : null), [place.data])
  if (place.error) return <ErrorBox message={`NASA POWER could not be reached: ${place.error}`} />
  if (!place.data || !analyses)
    return (
      <section className="section">
        <div className="wrap loading" style={{ padding: 0 }}>
          Fetching 45 years of monthly data from NASA POWER for {name ?? formatLatLon(lat, lon)}…
        </div>
      </section>
    )
  const p = place.data
  const items = rankItems(analyses)
  const nSig = items.filter((i) => i.a.verdict === 'significant').length
  const q = { lat: lat.toFixed(3), lon: lon.toFixed(3), name }
  const focus = wanted && analyses[wanted] ? wanted : undefined
  return (
    <section className="section">
      <div className="wrap">
        <div className="section-head">
          <div>
            <span className="eyebrow">Trend Radar · live</span>
            <h2>{p.name}</h2>
            <p className="small muted" style={{ marginTop: 8 }}>
              {p.subtitle}
            </p>
          </div>
          <p className="small" style={{ maxWidth: '40ch' }}>
            <strong>{nSig}</strong> of {items.length} variables show a significant trend at this spot.
          </p>
        </div>
        {focus && (
          <div className="note" style={{ marginBottom: 20 }}>
            <strong>You asked about {cat.variables[focus].name.toLowerCase()}.</strong> {sentence(analyses[focus], cat.variables[focus], p.name)}{' '}
            <a href={href(['trend', 'point', focus], q)}>See the evidence →</a>
          </div>
        )}
        <Radar cat={cat} items={items} topic="all" onSelect={(id) => navigate(['trend', 'point', id], q)} />
        {Object.entries(p.missing ?? {}).map(([v, why]) => (
          <p key={v} className="small muted" style={{ marginTop: 10 }}>
            {cat.variables[v].name}: {why}
          </p>
        ))}
      </div>
    </section>
  )
}
