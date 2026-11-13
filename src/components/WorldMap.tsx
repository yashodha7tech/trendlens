import L from 'leaflet'
import { useEffect, useRef } from 'react'
import { bboxBounds, referenceLayers, reliefLayer } from '../lib/gibs'
import type { RegionMeta } from '../lib/types'

interface Props {
  regions: Record<string, RegionMeta>
  selected?: string
  point?: [number, number] | null
  onRegion?: (id: string) => void
  onPoint?: (lat: number, lon: number) => void
  height?: number | string
  dark?: boolean
  fitTo?: 'world' | 'point'
}

/** World map of the featured regions. Click a box to explore it, or anywhere else to investigate that spot. */
export default function WorldMap({ regions, selected, point, onRegion, onPoint, height = '100%', dark = true, fitTo = 'world' }: Props) {
  const el = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const boxes = useRef<Record<string, L.Rectangle>>({})
  const marker = useRef<L.CircleMarker | null>(null)
  const cb = useRef({ onRegion, onPoint })
  cb.current = { onRegion, onPoint }
  const selectedRef = useRef(selected)
  selectedRef.current = selected

  useEffect(() => {
    if (!el.current) return
    const map = L.map(el.current, { scrollWheelZoom: false, worldCopyJump: true, minZoom: 1, zoomSnap: 0.25 })
    if (dark) el.current.style.background = '#050608'
    const ref = map.createPane('ref')
    ref.style.zIndex = '640'
    ref.style.pointerEvents = 'none'
    reliefLayer(dark ? 0.78 : 0.5).addTo(map)
    referenceLayers('ref')[0].addTo(map)
    const all = Object.values(regions).reduce<L.LatLngBounds | null>((b, r) => (b ? b.extend(bboxBounds(r.bbox)) : bboxBounds(r.bbox)), null)
    if (all) map.fitBounds(all.pad(0.18), { animate: false })
    else map.setView([18, 10], 1.6)
    for (const [id, r] of Object.entries(regions)) {
      const rect = L.rectangle(bboxBounds(r.bbox), { color: '#ffffff', weight: 1.5, fillColor: '#ffffff', fillOpacity: 0.08 })
      const label = document.createElement('span')
      label.textContent = r.name
      rect.bindTooltip(label, { permanent: true, direction: 'top', className: 'tl-region', offset: [0, -2] })
      rect.on('click', (e) => {
        L.DomEvent.stopPropagation(e)
        cb.current.onRegion?.(id)
      })
      rect.on('mouseover', () => rect.setStyle({ fillOpacity: 0.22 }))
      rect.on('mouseout', () => rect.setStyle({ fillOpacity: id === selectedRef.current ? 0.3 : 0.08 }))
      rect.addTo(map)
      boxes.current[id] = rect
    }
    map.on('click', (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng
      const lon = ((((lng + 180) % 360) + 360) % 360) - 180
      cb.current.onPoint?.(lat, lon)
    })
    mapRef.current = map
    const ro = new ResizeObserver(() => map.invalidateSize({ pan: false }))
    ro.observe(el.current)
    return () => {
      ro.disconnect()
      map.remove()
      mapRef.current = null
      boxes.current = {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    for (const [id, rect] of Object.entries(boxes.current)) rect.setStyle({ fillOpacity: id === selected ? 0.3 : 0.08, weight: id === selected ? 2.5 : 1.5 })
  }, [selected])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    marker.current?.remove()
    marker.current = null
    if (point) {
      marker.current = L.circleMarker(point, { radius: 7, color: '#ffffff', weight: 2.5, fillColor: '#e4322b', fillOpacity: 1 }).addTo(map)
      if (fitTo === 'point') map.setView(point, Math.max(map.getZoom(), 4), { animate: false })
    }
  }, [point, fitTo])

  return <div ref={el} style={{ position: 'absolute', inset: 0, height }} />
}
