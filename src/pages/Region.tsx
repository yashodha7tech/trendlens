import L from 'leaflet'
import { useEffect, useMemo, useRef, useState } from 'react'
import Radar, { rankItems } from '../components/Radar'
import TrendMap from '../components/TrendMap'
import { analyzeSeries } from '../lib/data'
import { sentence } from '../lib/format'
import { bboxBounds, referenceLayers, reliefLayer } from '../lib/gibs'
import { useTitle } from '../lib/hooks'
import {
  MAX_SPAN,
  MIN_SPAN,
  boxLabel,
  clampBox,
  compareWithCatalog,
  estimateDownload,
  featuredMatch,
  formatBox,
  loadDrawnRegion,
  parseBox,
  type Box,
  type DrawnRegion,
  type LoadProgress,
} from '../lib/regional'
import { navigate, setQuery } from '../lib/router'
import type { Analysis } from '../lib/stats'
import type { Catalog } from '../lib/types'

const EXAMPLES: { name: string; box: Box }[] = [
  { name: 'Nile Delta, Egypt', box: [29, 32, 29, 33] },
  { name: 'Murray–Darling Basin, Australia', box: [-36, -30, 142, 150] },
  { name: 'Paris Basin, France', box: [47, 50, 0, 4] },
  { name: 'Lake Chad basin', box: [11, 15, 12, 16] },
  { name: 'Mekong Delta, Vietnam', box: [8.5, 11.5, 104, 107] },
]

/** Draw a box with two clicks (corner, then opposite corner). */
function BoxPicker({ box, onBox }: { box: Box | null; onBox: (b: Box) => void }) {
  const el = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const rectRef = useRef<L.Rectangle | null>(null)
  const cornerRef = useRef<L.LatLng | null>(null)
  const markRef = useRef<L.CircleMarker | null>(null)
  const onBoxRef = useRef(onBox)
  onBoxRef.current = onBox

  useEffect(() => {
    if (!el.current) return
    const map = L.map(el.current, { scrollWheelZoom: false, worldCopyJump: true, minZoom: 1, zoomSnap: 0.25 })
    const ref = map.createPane('ref')
    ref.style.zIndex = '640'
    ref.style.pointerEvents = 'none'
    reliefLayer(0.85).addTo(map)
    referenceLayers('ref')[0].addTo(map)
    map.setView([20, 10], 2)
    map.on('click', (e: L.LeafletMouseEvent) => {
      const c = e.latlng.wrap()
      if (!cornerRef.current) {
        cornerRef.current = c
        markRef.current?.remove()
        markRef.current = L.circleMarker(c, { radius: 5, color: '#fc3d21', weight: 2, fillOpacity: 1 }).addTo(map)
        return
      }
      const a = cornerRef.current
      cornerRef.current = null
      markRef.current?.remove()
      onBoxRef.current(clampBox([Math.min(a.lat, c.lat), Math.max(a.lat, c.lat), Math.min(a.lng, c.lng), Math.max(a.lng, c.lng)]))
    })
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    rectRef.current?.remove()
    rectRef.current = null
    if (box) {
      rectRef.current = L.rectangle(bboxBounds(box), { color: '#fc3d21', weight: 2, fillOpacity: 0.12 }).addTo(map)
      map.fitBounds(bboxBounds(box).pad(1.2), { animate: false, maxZoom: 6 })
    }
  }, [box])

  return <div ref={el} className="map region-picker" role="application" aria-label="Map: click one corner of your region, then the opposite corner" />
}

function BoundsForm({ box, onBox }: { box: Box | null; onBox: (b: Box) => void }) {
  const [v, setV] = useState<string[]>(box ? box.map(String) : ['', '', '', ''])
  useEffect(() => setV(box ? box.map(String) : ['', '', '', '']), [box])
  const labels = ['South (lat)', 'North (lat)', 'West (lon)', 'East (lon)']
  const nums = v.map(Number)
  const ok = v.every((x) => x.trim() !== '') && nums.every(Number.isFinite) && nums[0] < nums[1] && nums[2] < nums[3]
  return (
    <form
      className="region-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (ok) onBox(clampBox(nums as Box))
      }}
    >
      {labels.map((lab, i) => (
        <label key={lab} className="field">
          <span>{lab}</span>
          <input type="text" inputMode="decimal" value={v[i]} onChange={(e) => setV(v.map((x, j) => (j === i ? e.target.value : x)))} />
        </label>
      ))}
      <button className="btn ghost" type="submit" disabled={!ok}>
        Use these bounds
      </button>
    </form>
  )
}

function Progress({ p }: { p: LoadProgress | null }) {
  if (!p) return <p className="loading">Connecting to NASA POWER…</p>
  const done = p.items.filter((i) => i.state === 'done' || i.state === 'cached').length
  return (
    <div className="region-progress" aria-live="polite">
      <p>
        <strong>
          {p.phase === 'compute' ? 'Running every test in your browser…' : `Downloading from NASA POWER: ${done} of ${p.items.length} datasets`}
        </strong>
      </p>
      <div className="region-bar">
        <span style={{ width: `${(100 * done) / Math.max(1, p.items.length)}%` }} />
      </div>
      <ul className="tiny muted">
        {p.items.map((it) => (
          <li key={it.key}>
            {it.code} from {it.start}: {it.state}
            {it.attempt > 1 ? ` (try ${it.attempt})` : ''}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function Region({ cat, query }: { cat: Catalog; query: URLSearchParams }) {
  useTitle('Your own region')
  const box = useMemo(() => {
    const b = parseBox(query.get('bbox'))
    return b ? clampBox(b) : null
  }, [query])
  const [draft, setDraft] = useState<Box | null>(box)
  useEffect(() => setDraft(box), [box])
  const [progress, setProgress] = useState<LoadProgress | null>(null)
  const [result, setResult] = useState<DrawnRegion | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!box) return
    const ctl = new AbortController()
    setResult(null)
    setError(null)
    setProgress(null)
    loadDrawnRegion(cat, box, { signal: ctl.signal, onProgress: (p) => setProgress({ ...p, items: p.items.map((i) => ({ ...i })) }) })
      .then((r) => setResult(r))
      .catch((e: unknown) => {
        if (!ctl.signal.aborted) setError(e instanceof Error ? e.message : String(e))
      })
    return () => ctl.abort()
  }, [box ? formatBox(box) : '', nonce])

  const analyses = useMemo(() => {
    if (!result) return null
    const out: Record<string, Analysis> = {}
    for (const [vid, s] of Object.entries(result.series)) {
      try {
        out[vid] = analyzeSeries(s)
      } catch {
        /* too short or empty over this box */
      }
    }
    return out
  }, [result])
  const items = useMemo(() => (analyses ? rankItems(analyses) : []), [analyses])
  const sel = query.get('v') && analyses?.[query.get('v')!] ? query.get('v')! : items[0]?.id
  const featured = box ? featuredMatch(cat, box) : undefined
  const check = featured && analyses ? compareWithCatalog(cat, featured, analyses) : null
  const est = draft ? estimateDownload(cat, draft) : null
  const place = box ? `the box ${boxLabel(box)}` : ''

  const go = (b: Box) => navigate(['region'], { bbox: formatBox(b) })

  return (
    <>
      <div className="page-head">
        <div className="wrap">
          <span className="eyebrow">Live mode · any region on Earth</span>
          <h1>Investigate your own region</h1>
          <p className="lede">
            Draw a box from {MIN_SPAN}° to {MAX_SPAN}° on a side. TrendLens downloads NASA POWER monthly data for every grid cell in it, averages the land
            cells by their true area, and runs the same tests as the featured regions, right in your browser.
          </p>
        </div>
      </div>

      <section className="section">
        <div className="wrap explore">
          <div>
            <BoxPicker box={draft} onBox={setDraft} />
            <p className="tiny muted" style={{ marginTop: 8 }}>
              Click one corner, then the opposite corner. Boxes smaller than {MIN_SPAN}° or larger than {MAX_SPAN}° are adjusted to fit NASA POWER's
              limits.
            </p>
          </div>
          <div className="stack">
            <BoundsForm box={draft} onBox={setDraft} />
            <div>
              <span className="eyebrow">Or try an example</span>
              <div className="chips" style={{ marginTop: 8 }}>
                {EXAMPLES.map((ex) => (
                  <button key={ex.name} className="chip" type="button" onClick={() => go(ex.box)}>
                    {ex.name}
                  </button>
                ))}
              </div>
            </div>
            {draft && (
              <div className="note">
                <strong>{boxLabel(draft)}</strong>
                {est && (
                  <span className="small">
                    {' '}
                    · {est.requests} downloads, about {Math.max(1, Math.round(est.bytes / 1e6))} MB
                  </span>
                )}
                <div style={{ marginTop: 10 }}>
                  <button className="btn" type="button" onClick={() => go(draft)}>
                    Analyse this region <span aria-hidden="true">→</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {box && (
        <section className="section" id="region-results">
          <div className="wrap">
            <div className="section-head">
              <div>
                <span className="eyebrow">Step 2 · Find</span>
                <h2>What is changing in {boxLabel(box)}?</h2>
              </div>
            </div>
            {error && (
              <div className="error">
                NASA POWER did not answer: {error}{' '}
                <button className="btn small" type="button" onClick={() => setNonce(nonce + 1)}>
                  Try again
                </button>
              </div>
            )}
            {!error && !result && <Progress p={progress} />}
            {result && analyses && (
              <>
                <p className="small" style={{ color: 'var(--ink-2)', marginBottom: 14 }}>
                  {result.water
                    ? 'This box has no land cells, so values are averaged over every cell (ocean included).'
                    : `${result.nLand} of ${result.nCells} MERRA-2 grid cells are land and are averaged by area.`}
                  {result.failed.length > 0 && ` Some downloads failed (${result.failed.join(', ')}); try again to fetch only those.`}
                </p>
                {check && check.length > 0 && (
                  <p className="note small" style={{ marginBottom: 14 }}>
                    This box is the featured {cat.regions[featured!].name}. Browser results match the published pipeline on{' '}
                    <strong>
                      {check.filter((r) => r.ok).length} of {check.length}
                    </strong>{' '}
                    checks.
                  </p>
                )}
                <div className="explore">
                  <Radar cat={cat} items={items} topic="all" selected={sel} onSelect={(id) => setQuery({ v: id })} />
                  {sel && analyses[sel] && (
                    <div className="sticky-col stack">
                      <p className="verdict-line" style={{ fontSize: '1.15rem' }}>
                        {sentence(analyses[sel], cat.variables[sel], place)}
                      </p>
                      {result.maps[sel] ? (
                        <TrendMap layers={[{ bbox: box, map: result.maps[sel] }]} meta={cat.variables[sel]} height={380} />
                      ) : (
                        <p className="note">No cell-by-cell map for this variable.</p>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </section>
      )}
    </>
  )
}
