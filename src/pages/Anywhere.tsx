import { useMemo, useState } from 'react'
import { ErrorBox } from '../components/bits'
import Radar, { rankItems } from '../components/Radar'
import WorldMap from '../components/WorldMap'
import { analyzeSeries, formatLatLon, geocode, loadPoint } from '../lib/data'
import { sentence } from '../lib/format'
import { useAsync, useTitle } from '../lib/hooks'
import { href, navigate } from '../lib/router'
import type { Analysis } from '../lib/stats'
import type { Catalog } from '../lib/types'

export default function Anywhere({ cat, query }: { cat: Catalog; query: URLSearchParams }) {
  const lat = query.get('lat') !== null ? Number(query.get('lat')) : null
  const lon = query.get('lon') !== null ? Number(query.get('lon')) : null
  const name = query.get('name') ?? undefined
  const wanted = query.get('v') ?? undefined
  const has = lat !== null && lon !== null && Number.isFinite(lat) && Number.isFinite(lon)
  useTitle(has ? `Anywhere · ${name ?? formatLatLon(lat!, lon!)}` : 'Anywhere')
  const [q, setQ] = useState('')
  const [msg, setMsg] = useState('')

  async function search(e: React.FormEvent) {
    e.preventDefault()
    if (!q.trim()) return
    setMsg('Searching…')
    try {
      const g = await geocode(q.trim())
      if (!g) return setMsg(`No place called "${q}" found.`)
      setMsg('')
      navigate(['anywhere'], { lat: g.lat.toFixed(3), lon: g.lon.toFixed(3), name: g.name })
    } catch {
      setMsg('Place search is unavailable. Click the map instead.')
    }
  }

  return (
    <>
      <div className="page-head">
        <div className="wrap grid-2" style={{ alignItems: 'start' }}>
          <div>
            <span className="eyebrow">Live mode · NASA POWER</span>
            <h1 style={{ marginTop: 12 }}>Investigate any spot on Earth</h1>
            <p className="lede">
              Click the map or search for a place. TrendLens fetches 25 to 45 years of monthly NASA data for that grid cell straight from NASA POWER
              and runs every test in your browser.
            </p>
            <form onSubmit={search} style={{ display: 'flex', gap: 8, marginTop: 20, maxWidth: 520 }}>
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Town, city or region" aria-label="Place name" style={{ flex: 1 }} />
              <button className="btn" type="submit">
                Search
              </button>
            </form>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
              {'geolocation' in navigator && (
                <button
                  className="btn small ghost"
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
              <span className="small muted" aria-live="polite">
                {msg}
              </span>
            </div>
          </div>
          <div className="map" style={{ height: 340 }}>
            <WorldMap
              regions={cat.regions}
              dark={false}
              point={has ? [lat!, lon!] : null}
              fitTo="point"
              onRegion={(id) => navigate(['explore', id])}
              onPoint={(la, lo) => navigate(['anywhere'], { lat: la.toFixed(3), lon: lo.toFixed(3) })}
            />
          </div>
        </div>
      </div>
      {has ? <PointRadar cat={cat} lat={lat!} lon={lon!} name={name} wanted={wanted} /> : <Suggestions />}
    </>
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
  const analyses = useMemo(() => {
    if (!place.data) return null
    const out: Record<string, Analysis> = {}
    for (const [vid, s] of Object.entries(place.data.series)) out[vid] = analyzeSeries(s)
    return out
  }, [place.data])
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
