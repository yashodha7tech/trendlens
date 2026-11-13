import L from 'leaflet'
import { useEffect, useMemo, useRef, useState } from 'react'
import { divergingColor, legendBins, niceLimit } from '../lib/colors'
import { fmt, fmtP, unitText, valueUnit } from '../lib/format'
import { bboxBounds, modisLayer, referenceLayers, reliefLayer } from '../lib/gibs'
import type { MapJSON, VariableMeta } from '../lib/types'

export interface MapLayer {
  bbox: [number, number, number, number]
  map: MapJSON
  label?: string
}

interface Props {
  layers: MapLayer[]
  meta: VariableMeta
  height?: number
}

/** Per-cell (or per-site) trend map: colour = slope per decade, dot = significant after FDR. */
export default function TrendMap({ layers, meta, height = 440 }: Props) {
  const el = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const dataRef = useRef<L.LayerGroup | null>(null)
  const baseRef = useRef<{ relief: L.TileLayer; modis: L.TileLayer; date: string } | null>(null)
  const [base, setBase] = useState<'relief' | 'modis'>('relief')

  const limit = useMemo(() => niceLimit(layers.flatMap((l) => l.map.cells.map((c) => c[2]))), [layers])
  const dec = Math.max(0, -Math.floor(Math.log10(limit / 5)) + 0)

  useEffect(() => {
    if (!el.current) return
    const map = L.map(el.current, { scrollWheelZoom: false, zoomSnap: 0.25, attributionControl: true, worldCopyJump: true })
    map.createPane('cells').style.zIndex = '420'
    const ref = map.createPane('ref')
    ref.style.zIndex = '640'
    ref.style.pointerEvents = 'none'
    const relief = reliefLayer(0.42).addTo(map)
    const m = modisLayer(2)
    referenceLayers('ref').forEach((l) => l.addTo(map))
    baseRef.current = { relief, modis: m.layer, date: m.date }
    dataRef.current = L.layerGroup().addTo(map)
    mapRef.current = map
    // the container can change size after layout settles (grids, sticky columns)
    const ro = new ResizeObserver(() => map.invalidateSize({ pan: false }))
    ro.observe(el.current)
    return () => {
      ro.disconnect()
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const b = baseRef.current
    if (!map || !b) return
    if (base === 'modis') {
      map.removeLayer(b.relief)
      b.modis.addTo(map)
    } else {
      map.removeLayer(b.modis)
      b.relief.addTo(map)
    }
  }, [base])

  useEffect(() => {
    const map = mapRef.current
    const group = dataRef.current
    if (!map || !group) return
    group.clearLayers()
    const renderer = L.canvas({ pane: 'cells', padding: 0.2 })
    let all: L.LatLngBounds | null = null
    for (const layer of layers) {
      const bounds = bboxBounds(layer.bbox)
      all = all ? all.extend(bounds) : L.latLngBounds(bounds.getSouthWest(), bounds.getNorthEast())
      const { map: mj } = layer
      for (const c of mj.cells) {
        const [lat, lon, slope, p, sig, mean] = c
        const tip = document.createElement('div')
        const strong = document.createElement('strong')
        strong.textContent = `${fmt(slope, dec + 1, true)}${unitText(meta)} per decade`
        tip.append(strong)
        const lines = [
          `${lat.toFixed(2)}°, ${lon.toFixed(2)}°${layer.label ? ` · ${layer.label}` : ''}`,
          `p ${fmtP(p).startsWith('<') ? fmtP(p) : '= ' + fmtP(p)} · ${sig ? 'significant after FDR' : 'not significant after FDR'}`,
        ]
        if (mean !== undefined && mean !== null) lines.push(`site average ${fmt(mean, meta.decimals)}${valueUnit(meta)}`)
        for (const t of lines) {
          const d = document.createElement('div')
          d.textContent = t
          tip.append(d)
        }
        const fill = divergingColor(slope, limit)
        if (mj.kind === 'grid') {
          const dl = (mj.dlat ?? 0.5) / 2
          const dn = (mj.dlon ?? 0.625) / 2
          L.rectangle(
            [
              [lat - dl, lon - dn],
              [lat + dl, lon + dn],
            ],
            { renderer, fillColor: fill, fillOpacity: 0.9, color: '#ffffff', weight: 0.6, opacity: 0.8 },
          )
            .bindTooltip(tip, { sticky: true, className: 'tl-tip', direction: 'top' })
            .addTo(group)
          if (sig) L.circleMarker([lat, lon], { renderer, radius: 1.8, fillColor: '#0b0b0b', fillOpacity: 1, stroke: false, interactive: false }).addTo(group)
        } else {
          L.circleMarker([lat, lon], {
            renderer,
            radius: 9,
            fillColor: fill,
            fillOpacity: 1,
            color: sig ? '#0b0b0b' : '#ffffff',
            weight: sig ? 2.5 : 2,
          })
            .bindTooltip(tip, { sticky: true, className: 'tl-tip', direction: 'top' })
            .addTo(group)
        }
      }
      L.rectangle(bounds, { fill: false, color: '#0b0b0b', weight: 1.5, interactive: false, pane: 'cells' }).addTo(group)
    }
    if (all) map.fitBounds(all.pad(layers.length > 1 ? 0.05 : 0.12), { animate: false })
  }, [layers, limit, meta, dec])

  const bins = legendBins(limit)
  const kind = layers[0]?.map.kind
  const nCells = layers.reduce((s, l) => s + l.map.cells.length, 0)
  const nSig = layers.reduce((s, l) => s + l.map.n_sig, 0)
  const nRaw = layers.reduce((s, l) => s + l.map.n_sig_raw, 0)

  return (
    <div>
      <div className="map" style={{ height }}>
        <div ref={el} style={{ position: 'absolute', inset: 0 }} />
        <div className="basemap-toggle">
          <div className="seg" role="group" aria-label="Background imagery">
            <button aria-pressed={base === 'relief'} onClick={() => setBase('relief')}>
              Relief
            </button>
            <button aria-pressed={base === 'modis'} onClick={() => setBase('modis')} title={`MODIS Terra true colour, ${baseRef.current?.date ?? 'recent'}`}>
              MODIS now
            </button>
          </div>
        </div>
      </div>
      <div className="map-legend">
        <div className="bins" aria-hidden="true">
          {bins.map((b, i) => (
            <span key={i} style={{ background: b.color }} />
          ))}
        </div>
        <div className="ticks">
          <span>{fmt(-limit, dec)}</span>
          <span>▼ falling · {unitText(meta).trim() || 'units'} per decade · rising ▲</span>
          <span>{fmt(limit, dec, true)}</span>
        </div>
        <p className="tiny muted">
          {kind === 'grid' ? (
            <>
              Each square is one model grid cell. <span style={{ color: 'var(--ink)' }}>●</span> marks cells whose trend stays significant after
              false-discovery-rate correction (Benjamini–Hochberg, 5%).
            </>
          ) : (
            <>
              Each circle is one MODIS sample site (2 × 2 km of 250 m pixels). A black ring marks sites significant after false-discovery-rate
              correction (Benjamini–Hochberg, 5%).
            </>
          )}{' '}
          <strong style={{ color: 'var(--ink)' }}>
            {nSig} of {nCells}
          </strong>{' '}
          {kind === 'grid' ? 'cells' : 'sites'} pass ({nRaw} would pass without the correction).
        </p>
      </div>
    </div>
  )
}
