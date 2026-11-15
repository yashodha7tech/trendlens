import maplibregl, { type GeoJSONSourceSpecification, type MapMouseEvent, type StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef, useState } from 'react'
import { FALL, FLAT_LINE, RISE } from '../lib/colors'
import { formatLatLon } from '../lib/data'
import { prefersReducedMotion, trendGlyph, type GlobeProps, type GlobeRegion } from './GlobeLoader'

/**
 * Interactive 3D globe (MapLibre GL globe projection) with NASA GIBS imagery: Blue Marble, or
 * near-real-time MODIS Terra true colour. Featured regions are outlined and coloured by their
 * headline trend; clicking anywhere else reports that spot through onPick.
 * Loaded lazily through GlobeLoader, so none of this reaches the main bundle.
 */

type Imagery = 'bluemarble' | 'modis'

/** Same GIBS WMTS layers as src/lib/gibs.ts, fetched through a retrying protocol (see below). */
const GIBS = 'gibs://gibs.earthdata.nasa.gov/wmts/epsg3857/best'
const BLUE_MARBLE = `${GIBS}/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg`
const modisTiles = (date: string) => `${GIBS}/MODIS_Terra_CorrectedReflectance_TrueColor/default/${date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`
/** MODIS true colour from two days ago, when the whole day's passes are in (as in gibs.ts). */
const modisDate = () => new Date(Date.now() - 2 * 86400_000).toISOString().slice(0, 10)

const PICK_ZOOM = 3.2
const SPIN_DEG_PER_MS = 0.0025 // a full turn in about two and a half minutes

let protocolAdded = false
/** GIBS tiles over a flaky network: retry 5xx answers and dropped connections twice with backoff. */
function addRetryingProtocol() {
  if (protocolAdded) return
  protocolAdded = true
  maplibregl.addProtocol('gibs', async (params, abort) => {
    const url = params.url.replace(/^gibs:\/\//, 'https://')
    let last: unknown = new Error('tile failed')
    for (let i = 0; i < 3; i++) {
      try {
        const r = await fetch(url, { signal: abort.signal, mode: 'cors' })
        if (r.ok) return { data: await r.arrayBuffer() }
        last = new Error(`GIBS ${r.status}`)
        if (r.status < 500) break
      } catch (e) {
        if (abort.signal.aborted) throw e
        last = e
      }
      await new Promise((res) => setTimeout(res, 600 * 2 ** i))
    }
    throw last
  })
}

/** Colour tokens from the page theme, as plain colours MapLibre can parse. */
function palette(el: HTMLElement) {
  const cs = getComputedStyle(el)
  const tok = (name: string, fallback: string) => {
    const v = cs.getPropertyValue(name).trim()
    return /^(#|rgb|hsl)/i.test(v) ? v : fallback
  }
  return {
    rise: tok('--rise', RISE[2]),
    fall: tok('--fall', FALL[2]),
    flat: tok('--flat', FLAT_LINE),
    ocean: tok('--space-2', '#0d2246'),
  }
}

/** Box outline densified to one point per degree so its edges follow parallels and meridians on the sphere. */
function ring([la0, la1, lo0, lo1]: [number, number, number, number]): [number, number][] {
  const pts: [number, number][] = []
  for (let x = lo0; x < lo1; x++) pts.push([x, la0])
  for (let y = la0; y < la1; y++) pts.push([lo1, y])
  for (let x = lo1; x > lo0; x--) pts.push([x, la1])
  for (let y = la1; y > la0; y--) pts.push([lo0, y])
  pts.push([lo0, la0])
  return pts
}

function regionsGeoJSON(regions: GlobeRegion[], pal: ReturnType<typeof palette>): GeoJSONSourceSpecification['data'] {
  return {
    type: 'FeatureCollection',
    features: regions.map((r) => ({
      type: 'Feature' as const,
      properties: {
        id: r.id,
        fill: r.dir === 'rise' ? pal.rise : r.dir === 'fall' ? pal.fall : pal.flat,
        // light tints of the same hues read clearly over dark imagery
        line: r.dir === 'rise' ? RISE[1] : r.dir === 'fall' ? FALL[1] : FLAT_LINE,
      },
      geometry: { type: 'Polygon' as const, coordinates: [ring(r.bbox)] },
    })),
  }
}

function buildStyle(regions: GlobeRegion[], pal: ReturnType<typeof palette>, date: string): StyleSpecification {
  const hover = ['boolean', ['feature-state', 'hover'], false]
  return {
    version: 8,
    projection: { type: 'globe' },
    sky: { 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7, 0] },
    sources: {
      bluemarble: { type: 'raster', tiles: [BLUE_MARBLE], tileSize: 256, maxzoom: 8 },
      modis: { type: 'raster', tiles: [modisTiles(date)], tileSize: 256, maxzoom: 9 },
      regions: { type: 'geojson', data: regionsGeoJSON(regions, pal), promoteId: 'id' },
    },
    layers: [
      { id: 'ocean', type: 'background', paint: { 'background-color': pal.ocean } },
      { id: 'bluemarble', type: 'raster', source: 'bluemarble', paint: { 'raster-fade-duration': 250 } },
      { id: 'modis', type: 'raster', source: 'modis', layout: { visibility: 'none' }, paint: { 'raster-fade-duration': 250 } },
      {
        id: 'regions-fill',
        type: 'fill',
        source: 'regions',
        paint: { 'fill-color': ['get', 'fill'], 'fill-opacity': ['case', hover, 0.5, 0.26] },
      },
      {
        id: 'regions-line',
        type: 'line',
        source: 'regions',
        paint: { 'line-color': ['get', 'line'], 'line-width': ['case', hover, 3, 1.8] },
      },
    ] as StyleSpecification['layers'],
  }
}

/**
 * Zoom at which the whole globe fills about 84% of the smaller side of the frame.
 * MapLibre draws the globe's disc about 0.86 times the size of a 512 px world circumference over pi (measured).
 */
function fitZoom(w: number, h: number): number {
  const d = 0.84 * Math.min(w, h)
  return Math.max(0, Math.min(3, Math.log2((d * Math.PI) / (512 * 0.86))))
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag)
  if (cls) n.className = cls
  if (text) n.textContent = text
  return n
}

/** Popup / tooltip body for a featured region. */
function regionNode(r: GlobeRegion, actions?: { onAnalyse?: () => void }): HTMLElement {
  const root = el('div', 'globe-pop-body')
  root.append(el('span', 'globe-pop-eyebrow', 'Featured region'), el('strong', 'globe-pop-name', r.name))
  const t = el('span', `globe-pop-trend ${r.dir}`)
  const g = el('i', '', trendGlyph(r.dir))
  g.setAttribute('aria-hidden', 'true')
  t.append(g, ` ${r.variable ? `${r.variable} ` : ''}${r.trend}`)
  root.append(t)
  if (r.detail) root.append(el('span', 'globe-pop-note', 'Strongest significant trend'), el('span', 'globe-pop-detail', r.detail))
  if (actions) {
    const row = el('div', 'globe-pop-actions')
    const a = el('a', 'globe-pop-link', 'Explore this region →')
    a.href = r.href
    row.append(a)
    if (actions.onAnalyse) {
      const b = el('button', 'globe-pop-btn', 'Analyse this spot')
      b.type = 'button'
      b.addEventListener('click', actions.onAnalyse)
      row.append(b)
    }
    root.append(row)
  }
  return root
}

export default function Globe({
  regions,
  onPick,
  point = null,
  pointLabel,
  initialView,
  autoRotate = true,
  legend = true,
  label = 'Interactive globe. Drag or use the arrow keys to turn it, plus and minus to zoom, Enter to investigate the spot under the crosshair.',
  onFail,
  children,
  className,
}: GlobeProps) {
  const canvasEl = useRef<HTMLDivElement>(null)
  const api = useRef<{
    map: maplibregl.Map
    pin: maplibregl.Marker
    popup: maplibregl.Popup
    stopSpin: () => void
    home: () => void
    showRegion: (r: GlobeRegion, at?: [number, number]) => void
  } | null>(null)
  const cb = useRef({ onPick, onFail })
  cb.current = { onPick, onFail }
  const [imagery, setImagery] = useState<Imagery>('bluemarble')
  const [date] = useState(modisDate)
  const [ready, setReady] = useState(false)
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches

  // ------------------------------------------------------------------ create once, dispose on unmount
  useEffect(() => {
    const host = canvasEl.current
    if (!host) return
    addRetryingProtocol()
    const reduced = prefersReducedMotion()
    const pal = palette(host)
    const { clientWidth: w, clientHeight: h } = host
    const start = initialView ?? { lat: point ? point[0] : 18, lon: point ? point[1] : 20 }
    let map: maplibregl.Map
    try {
      map = new maplibregl.Map({
        container: host,
        style: buildStyle(regions, pal, date),
        center: [start.lon, start.lat],
        zoom: start.zoom ?? (point ? PICK_ZOOM : fitZoom(w, h)),
        minZoom: 0,
        maxZoom: 9,
        maxPitch: 0,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        doubleClickZoom: false, // the first click already investigates that spot
        scrollZoom: false, // let the page scroll; zoom with the buttons, keys or a pinch
        cooperativeGestures: coarse, // one finger scrolls the page, two fingers turn the globe
        attributionControl: false, // the NASA GIBS credit is drawn by this component
        pixelRatio: Math.min(2, window.devicePixelRatio || 1),
        fadeDuration: 0,
        locale: {
          'Map.Title': label,
          'CooperativeGesturesHandler.MobileHelpText': 'Use two fingers to turn the globe',
          'NavigationControl.ZoomIn': 'Zoom in',
          'NavigationControl.ZoomOut': 'Zoom out',
        },
      })
    } catch (e) {
      cb.current.onFail?.(e instanceof Error ? e.message : String(e))
      return
    }
    map.touchZoomRotate.disableRotation()
    map.keyboard.disableRotation()
    map.addControl(new maplibregl.NavigationControl({ showCompass: false, visualizePitch: false }), 'top-right')
    map.on('error', (e) => {
      // a tile that still fails after retries just stays blank; anything else is worth a console line
      if (!('tile' in e)) console.warn('[globe]', e.error?.message ?? e)
    })
    map.on('webglcontextlost', () => cb.current.onFail?.('The WebGL context was lost.'))

    // ---------------- picked point
    const pinEl = el('div', 'globe-pin')
    pinEl.append(el('span', 'globe-pin-ring'), el('span', 'globe-pin-dot'))
    const pin = new maplibregl.Marker({ element: pinEl, anchor: 'center', opacityWhenCovered: '0' })

    // ---------------- region labels (decorative; the legend below carries the same text for keyboards and screen readers)
    const popup = new maplibregl.Popup({ closeButton: true, closeOnClick: false, maxWidth: '290px', className: 'globe-pop', offset: 10 })
    const tip = new maplibregl.Popup({ closeButton: false, closeOnClick: false, maxWidth: '260px', className: 'globe-tip', offset: 12 })
    const showRegion = (r: GlobeRegion, at?: [number, number]) => {
      tip.remove()
      const spot = at ?? r.center
      popup
        .setLngLat([spot[1], spot[0]])
        .setDOMContent(regionNode(r, { onAnalyse: cb.current.onPick ? () => cb.current.onPick?.(spot[0], spot[1]) : undefined }))
        .addTo(map)
    }
    const labels = regions.map((r) => {
      const n = el('div', `globe-label ${r.dir}`)
      n.setAttribute('aria-hidden', 'true')
      const g = el('i', '', trendGlyph(r.dir))
      n.append(g, ` ${r.name}`)
      n.addEventListener('click', (e) => {
        e.stopPropagation()
        stopSpin()
        showRegion(r)
      })
      return new maplibregl.Marker({ element: n, anchor: 'bottom', offset: [0, -2], opacityWhenCovered: '0' })
        .setLngLat([(r.bbox[2] + r.bbox[3]) / 2, r.bbox[1]])
        .addTo(map)
    })
    const syncLabels = () => host.classList.toggle('labels-on', map.getZoom() >= 1.15)
    map.on('zoom', syncLabels)
    syncLabels()

    // ---------------- slow spin until the user interacts; paused while hidden or scrolled away
    let spinning = autoRotate && !reduced && !point
    let raf = 0
    let last = 0
    let onScreen = true
    const frame = (t: number) => {
      raf = 0
      if (!spinning || document.hidden || !onScreen) return
      const dt = last ? Math.min(64, t - last) : 16
      last = t
      if (!map.isMoving()) {
        const c = map.getCenter()
        map.jumpTo({ center: [c.lng - dt * SPIN_DEG_PER_MS, c.lat] })
      }
      raf = requestAnimationFrame(frame)
    }
    const resume = () => {
      if (spinning && !raf && !document.hidden && onScreen) {
        last = 0
        raf = requestAnimationFrame(frame)
      }
    }
    const stopSpin = () => {
      spinning = false
      if (raf) cancelAnimationFrame(raf)
      raf = 0
    }
    for (const ev of ['mousedown', 'touchstart', 'wheel', 'dragstart'] as const) map.on(ev, stopSpin)
    const canvas = map.getCanvas()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && popup.isOpen()) {
        // from inside the popup too: close it and hand focus back to the globe
        popup.remove()
        canvas.focus()
        return
      }
      if (e.target !== canvas) return
      stopSpin()
      if (e.key === 'Enter') {
        const c = map.getCenter()
        cb.current.onPick?.(c.lat, ((((c.lng + 180) % 360) + 360) % 360) - 180)
      }
    }
    host.addEventListener('keydown', onKey)
    const onVisibility = () => {
      if (document.hidden) {
        if (raf) cancelAnimationFrame(raf)
        raf = 0
        map.stop()
      } else resume()
    }
    document.addEventListener('visibilitychange', onVisibility)
    const io = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting
      if (onScreen) resume()
      else if (raf) {
        cancelAnimationFrame(raf)
        raf = 0
      }
    })
    io.observe(host)

    // ---------------- hover and click
    let hovered: string | null = null
    const setHover = (id: string | null) => {
      if (hovered === id) return
      if (hovered) map.setFeatureState({ source: 'regions', id: hovered }, { hover: false })
      hovered = id
      if (id) map.setFeatureState({ source: 'regions', id }, { hover: true })
    }
    const byId = new Map(regions.map((r) => [r.id, r]))
    map.on('mousemove', 'regions-fill', (e) => {
      const id = e.features?.[0]?.properties?.id as string | undefined
      const r = id ? byId.get(id) : undefined
      if (!r) return
      if (hovered !== r.id) tip.setDOMContent(regionNode(r))
      setHover(r.id)
      canvas.style.cursor = 'pointer'
      if (popup.isOpen()) return void tip.remove()
      tip.setLngLat(e.lngLat)
      if (!tip.isOpen()) tip.addTo(map)
    })
    map.on('mouseleave', 'regions-fill', () => {
      setHover(null)
      canvas.style.cursor = ''
      tip.remove()
    })
    map.on('click', (e: MapMouseEvent) => {
      const target = e.originalEvent.target as Element | null
      if (target?.closest?.('.globe-label, .globe-pin, .maplibregl-popup')) return
      stopSpin()
      const hit = map.queryRenderedFeatures(e.point, { layers: ['regions-fill'] })[0]
      const r = hit ? byId.get(hit.properties?.id as string) : undefined
      const lat = e.lngLat.lat
      const lon = ((((e.lngLat.lng + 180) % 360) + 360) % 360) - 180
      if (r) return showRegion(r, [lat, lon])
      popup.remove()
      cb.current.onPick?.(lat, lon)
    })

    const home = () => {
      popup.remove()
      const z = initialView?.zoom ?? fitZoom(host.clientWidth, host.clientHeight)
      const c = map.getCenter()
      if (reduced) map.jumpTo({ center: c, zoom: z })
      else map.easeTo({ center: [c.lng, Math.max(-30, Math.min(30, c.lat))], zoom: z, duration: 1200 })
    }
    map.once('load', () => {
      setReady(true)
      resume()
    })

    api.current = { map, pin, popup, stopSpin, home, showRegion }
    return () => {
      api.current = null
      stopSpin()
      io.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      host.removeEventListener('keydown', onKey)
      popup.remove()
      tip.remove()
      pin.remove()
      labels.forEach((m) => m.remove())
      map.remove() // frees the WebGL context
    }
    // created once; props that change later are applied by the effects below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ------------------------------------------------------------------ imagery
  useEffect(() => {
    const a = api.current
    if (!a || !ready) return
    a.map.setLayoutProperty('bluemarble', 'visibility', imagery === 'bluemarble' ? 'visible' : 'none')
    a.map.setLayoutProperty('modis', 'visibility', imagery === 'modis' ? 'visible' : 'none')
  }, [imagery, ready])

  // ------------------------------------------------------------------ selected point: mark it and fly there
  const lat = point?.[0]
  const lon = point?.[1]
  useEffect(() => {
    const a = api.current
    if (!a) return
    if (lat === undefined || lon === undefined) {
      a.pin.remove()
      return
    }
    a.stopSpin()
    a.popup.remove()
    a.pin.setLngLat([lon, lat]).addTo(a.map)
    a.pin.getElement().setAttribute('aria-label', `Picked point: ${pointLabel ?? formatLatLon(lat, lon)}`)
    const zoom = Math.max(a.map.getZoom(), PICK_ZOOM)
    if (prefersReducedMotion()) a.map.jumpTo({ center: [lon, lat], zoom })
    else a.map.flyTo({ center: [lon, lat], zoom, speed: 1.1, curve: 1.5, essential: true })
  }, [lat, lon, pointLabel])

  const focusRegion = (r: GlobeRegion) => {
    const a = api.current
    if (!a) return
    a.stopSpin()
    const target = { center: [r.center[1], r.center[0]] as [number, number], zoom: Math.max(a.map.getZoom(), 2.4) }
    a.map.once('moveend', () => a.showRegion(r)) // registered first: jumpTo fires moveend synchronously
    if (prefersReducedMotion()) a.map.jumpTo(target)
    else a.map.flyTo({ ...target, speed: 1.2, essential: true })
  }

  const shortDate = new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  return (
    <div className={className ? `globe ${className}` : 'globe'}>
      <div className="globe-stage">
        <div className="globe-canvas" ref={canvasEl} />
        <span className="globe-cross" aria-hidden="true" />
        <div className="globe-imagery" role="group" aria-label="Globe imagery">
          <button type="button" aria-pressed={imagery === 'bluemarble'} onClick={() => setImagery('bluemarble')}>
            Blue Marble
          </button>
          <button
            type="button"
            aria-pressed={imagery === 'modis'}
            onClick={() => setImagery('modis')}
            title={`MODIS Terra true colour for ${date}, near-real-time from NASA GIBS. Dark gaps fall between satellite passes.`}
          >
            Satellite · {shortDate}
          </button>
        </div>
        <button type="button" className="globe-home" onClick={() => api.current?.home()}>
          Whole Earth
        </button>
        <p className="globe-credit">
          Imagery:{' '}
          <a href="https://earthdata.nasa.gov/gibs" target="_blank" rel="noreferrer">
            NASA GIBS
          </a>{' '}
          · {imagery === 'modis' ? `MODIS Terra true colour, ${date}` : 'Blue Marble'} ·{' '}
          <a href="https://maplibre.org" target="_blank" rel="noreferrer">
            MapLibre
          </a>
        </p>
      </div>
      {children}
      {legend && regions.length > 0 && (
        <div className="globe-legend">
          <span className="globe-legend-title">Featured regions · strongest trend</span>
          <ul>
            {regions.map((r) => (
              <li key={r.id}>
                <button type="button" className={`globe-chip ${r.dir}`} onClick={() => focusRegion(r)}>
                  <i aria-hidden="true">{trendGlyph(r.dir)}</i>
                  <span className="globe-chip-name">{r.name}</span>
                  <span className="globe-chip-var">{r.variable ? `${r.variableShort} ${r.trend.split(',')[0]}` : r.trend}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
