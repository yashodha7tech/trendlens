import type { Analysis } from './stats'
import type { VariableMeta } from './types'

const MINUS = '−'

/** Digits after the decimal point that show two significant figures of v. */
export function decimalsFor(v: number): number {
  const a = Math.abs(v)
  if (!Number.isFinite(a) || a === 0) return 2
  if (a >= 10) return 1
  return Math.min(5, Math.max(1, 1 - Math.floor(Math.log10(a))))
}

export function fmt(v: number | null | undefined, decimals: number, signed = false): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '–'
  const s = Math.abs(v).toFixed(decimals)
  const zero = Number(s) === 0
  if (v < 0 && !zero) return MINUS + s
  return (signed && !zero ? '+' : '') + s
}

export function fmtP(p: number): string {
  if (!Number.isFinite(p)) return '–'
  if (p < 0.001) return '< 0.001'
  if (p < 0.1) return p.toFixed(3) // three decimals near the 0.05 threshold, so 0.052 never reads as 0.05
  return p.toFixed(2)
}

export const pText = (p: number) => (p < 0.001 ? 'p < 0.001' : `p = ${fmtP(p)}`)

/** Unit of a change (slopes, differences). Tree cover changes are percentage points. */
export function unitText(meta: VariableMeta): string {
  if (meta.unit === 'fraction') return ''
  if (meta.unit === '%') return ' pp'
  return ` ${meta.unit}`
}

/** Unit of a change, written out for sentences. */
export function unitLong(meta: VariableMeta): string {
  if (meta.unit === '%') return ' percentage points'
  return unitText(meta)
}

/** Unit of a level (a measured value). */
export function valueUnit(meta: VariableMeta): string {
  if (meta.unit === 'fraction') return ''
  if (meta.unit === '%') return '%'
  return ` ${meta.unit}`
}

export const isRelative = (meta: VariableMeta) => meta.unit !== '°C'

export interface Rate {
  value: string
  low: string
  high: string
  perDecade: string
  percent: string | null
  ofAverage: string | null
}

/** Slope per decade with its 95% interval, formatted to a shared precision. */
export function rate(a: Analysis, meta: VariableMeta): Rate {
  const s = a.sen.slope * 10
  const lo = a.sen.low * 10
  const hi = a.sen.high * 10
  const d = decimalsFor(Math.max(Math.abs(s), Math.abs(hi - lo) / 4))
  const mean = meanOf(a.annual)
  const pct = isRelative(meta) && mean !== 0 ? (100 * s) / Math.abs(mean) : null
  const pd = pct === null ? 0 : Math.abs(pct) < 1 ? 2 : 1
  return {
    value: fmt(s, d, true),
    low: fmt(lo, d, true),
    high: fmt(hi, d, true),
    perDecade: `${fmt(s, d, true)}${unitLong(meta)} per decade`,
    percent: pct === null ? null : `${fmt(pct, pd, true)}% per decade`,
    ofAverage: pct === null ? null : `${fmt(pct, pd, true)}% of average`,
  }
}

export function meanOf(a: number[]): number {
  const ok = a.filter((v) => Number.isFinite(v))
  return ok.reduce((x, y) => x + y, 0) / ok.length
}

export type Dir = 'rise' | 'fall' | 'flat'
export const direction = (slope: number): Dir => (slope > 0 ? 'rise' : slope < 0 ? 'fall' : 'flat')
export const dirWord = (slope: number) => (slope > 0 ? 'rising' : slope < 0 ? 'falling' : 'flat')
export const dirGlyph = (slope: number) => (slope > 0 ? '▲' : slope < 0 ? '▼' : '■')

export const verdictLabel = {
  significant: 'Significant',
  not_yet: 'Not yet significant',
  none: 'No clear trend',
} as const

/** The fixed result sentence. Same format for every variable and place. */
export function sentence(a: Analysis, meta: VariableMeta, place: string): string {
  const r = rate(a, meta)
  const v = meta.name
  const mag = r.value.replace(/^[+−]/, '')
  const pct = r.ofAverage ? ` (${r.ofAverage.replace(/^[+−]/, '').replace('of average', 'of its average')})` : ''
  const per = `${mag}${unitLong(meta)} per decade${pct}`
  if (a.verdict === 'significant')
    return `${v} in ${place} is ${dirWord(a.sen.slope)} by about ${per} (95% interval ${r.low} to ${r.high}). This is unlikely to be chance (${pText(a.mk.p)}).`
  if (a.verdict === 'not_yet')
    return `${v} in ${place} shows a ${dirWord(a.sen.slope)} tendency of about ${per}, but we can't rule out chance (${pText(a.mk.p)}). More years of data may change this.`
  return `${v} in ${place} shows no clear trend: a change of about ${per} is small next to its normal year-to-year swings (${pText(a.mk.p)}).`
}

export function periodText(a: Analysis): string {
  return `${a.first}–${a.last} · ${a.nYears} years`
}
