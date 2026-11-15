import { Component, Suspense, lazy, type ReactNode } from 'react'
import { decimalsFor, direction, dirGlyph, dirWord, fmt, pText, unitText, type Dir } from '../lib/format'
import { href } from '../lib/router'
import type { Catalog } from '../lib/types'
import '../styles/globe.css'

/**
 * The small, always-loaded half of the 3D globe: shared types, the featured-region helper,
 * a WebGL check and a lazy loader. The globe itself (MapLibre GL, about 280 kB gzipped)
 * lives in Globe.tsx and is fetched only when a globe is shown.
 */

/** A featured region outlined on the globe, coloured by its headline trend. */
export interface GlobeRegion {
  id: string
  name: string
  /** lat0, lat1, lon0, lon1 */
  bbox: [number, number, number, number]
  /** lat, lon */
  center: [number, number]
  dir: Dir
  /** Variable of the headline trend, e.g. "Rainfall"; empty when nothing is significant. */
  variable: string
  /** Its short name, e.g. "Haze (AOD)" */
  variableShort: string
  /** e.g. "rising, +0.20 mm/day per decade" */
  trend: string
  /** e.g. "p < 0.001 · 1981–2025" */
  detail: string
  /** Explore page of the region */
  href: string
}

export interface GlobeCamera {
  lat: number
  lon: number
  /** Omit to fit the whole globe in the frame. */
  zoom?: number
}

export interface GlobeProps {
  /** Featured regions to outline (read when the globe is created, like initialView and autoRotate). */
  regions: GlobeRegion[]
  /** Called with the place the user clicked, tapped or chose with the keyboard. */
  onPick?: (lat: number, lon: number) => void
  /** The selected point, marked on the globe; the camera flies to it when it changes. */
  point?: [number, number] | null
  pointLabel?: string
  initialView?: GlobeCamera
  /** Spin slowly until the user interacts. Never spins with prefers-reduced-motion or while a point is selected. */
  autoRotate?: boolean
  /** Show the list of featured regions under the globe (keyboard access to the outlines). */
  legend?: boolean
  /** Accessible name of the globe canvas. */
  label?: string
  /** WebGL failed after the code loaded; the host should switch to a 2D map. */
  onFail?: (why: string) => void
  /** Shown directly under the globe, above the region list (for example the picked point's result). */
  children?: ReactNode
  /** Extra class on the root (and the loading placeholder), e.g. to size it elsewhere: `.my-hero :is(.globe-stage, .globe-skeleton) { height: 70vh }`. */
  className?: string
}

/**
 * Coordinates typed as text: "12.97, 77.59", "12.97 77.59", "12.97N 77.59E" or "33.45°S, 70.66°W".
 * Returns [lat, lon], or null when the text is not a coordinate pair on Earth.
 */
export function parseLatLon(text: string): [number, number] | null {
  const m = text.trim().match(/^([-+]?\d+(?:\.\d+)?)\s*°?\s*([NS])?\s*(?:[,;]\s*|\s+)([-+]?\d+(?:\.\d+)?)\s*°?\s*([EW])?$/i)
  if (!m) return null
  let lat = Number(m[1])
  let lon = Number(m[3])
  if (m[2]?.toUpperCase() === 'S') lat = -Math.abs(lat)
  if (m[4]?.toUpperCase() === 'W') lon = -Math.abs(lon)
  if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) return null
  return [lat, lon]
}

/** The strongest significant trend in each featured region (same rule as the Home headlines). */
export function featuredRegions(cat: Catalog): GlobeRegion[] {
  return Object.entries(cat.regions).map(([id, r]) => {
    const sig = Object.entries(cat.results[id] ?? {})
      .filter(([, s]) => s.verdict === 'significant')
      .sort((a, b) => b[1].snr - a[1].snr)
    const top = sig[0]
    const base = { id, name: r.name, bbox: r.bbox, center: r.center, href: href(['explore', id]) }
    if (!top) return { ...base, dir: 'flat' as Dir, variable: '', variableShort: '', trend: 'no significant trend yet', detail: '' }
    const [vid, s] = top
    const v = cat.variables[vid]
    return {
      ...base,
      dir: direction(s.slope),
      variable: v.name,
      variableShort: v.short,
      trend: `${dirWord(s.slope)}, ${fmt(s.slope, decimalsFor(s.slope), true)}${unitText(v)} per decade`,
      detail: `${pText(s.p)} · ${s.first}–${s.last}`,
    }
  })
}

export const trendGlyph = (d: Dir) => dirGlyph(d === 'rise' ? 1 : d === 'fall' ? -1 : 0)

let webgl: boolean | undefined
/** True when this browser can create a WebGL context (MapLibre tries WebGL 2, then WebGL 1). */
export function webglSupported(): boolean {
  if (webgl !== undefined) return webgl
  try {
    const c = document.createElement('canvas')
    const gl = (c.getContext('webgl2') ?? c.getContext('webgl')) as WebGLRenderingContext | null
    webgl = !!gl
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
  } catch {
    webgl = false
  }
  return webgl
}

export const prefersReducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

let pending: Promise<typeof import('./Globe')> | null = null
/** Start fetching the globe chunk (safe to call more than once). Retries once on a flaky network. */
export function preloadGlobe() {
  pending ??= import('./Globe')
    .catch(() => new Promise<void>((r) => setTimeout(r, 1200)).then(() => import('./Globe')))
    .catch((e: unknown) => {
      pending = null
      throw e
    })
  return pending
}

const Globe = lazy(preloadGlobe)

class Boundary extends Component<{ onFail?: (why: string) => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(e: unknown) {
    this.props.onFail?.(e instanceof Error ? e.message : String(e))
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

function Skeleton({ className }: { className?: string }) {
  return (
    <div className={className ? `globe ${className}` : 'globe'}>
      <div className="globe-skeleton" role="status">
        <span className="globe-skeleton-orb" aria-hidden="true" />
        <span className="globe-skeleton-text">Loading the globe…</span>
      </div>
    </div>
  )
}

/** Lazy 3D globe. Falls back through onFail when the code cannot load or WebGL fails. */
export default function GlobeLoader(props: GlobeProps) {
  return (
    <Boundary onFail={props.onFail}>
      <Suspense fallback={<Skeleton className={props.className} />}>
        <Globe {...props} />
      </Suspense>
    </Boundary>
  )
}
