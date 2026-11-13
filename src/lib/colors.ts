/** Diverging map scale: blue arm = increasing, coral arm = decreasing, five steps each.
 * Arms are lightness-matched (OKLCH) and validated as monotone single-hue ramps. */
export const RISE = ['#b7d3f6', '#86b6ef', '#5598e7', '#256abf', '#104281']
export const FALL = ['#f4c4b3', '#ea9c80', '#dd734c', '#b2420c', '#772400']
export const RISE_LINE = '#2a78d6'
export const FALL_LINE = '#eb6834'
export const FLAT_LINE = '#8f8d86'
export const STATION = '#4a3aa7'
export const MODEL = '#1baf7a'

export const lineColor = (slope: number) => (slope > 0 ? RISE_LINE : slope < 0 ? FALL_LINE : FLAT_LINE)

/** A symmetric, rounded scale limit from the 95th percentile of |values|. */
export function niceLimit(values: number[]): number {
  const a = values.map(Math.abs).filter(Number.isFinite).sort((x, y) => x - y)
  if (!a.length) return 1
  const q = a[Math.min(a.length - 1, Math.floor(0.95 * (a.length - 1)))] || a[a.length - 1] || 1
  const e = Math.pow(10, Math.floor(Math.log10(q)))
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * e >= q) return m * e
  return 10 * e
}

export function divergingColor(v: number, limit: number): string {
  if (!Number.isFinite(v)) return '#d9d8d2'
  const k = Math.min(4, Math.floor((Math.abs(v) / limit) * 5 - 1e-9))
  return v >= 0 ? RISE[Math.max(0, k)] : FALL[Math.max(0, k)]
}

/** Ten bins from -limit to +limit, for the legend. */
export function legendBins(limit: number): { color: string; from: number; to: number }[] {
  const out = []
  for (let k = 4; k >= 0; k--) out.push({ color: FALL[k], from: (-(k + 1) * limit) / 5, to: (-k * limit) / 5 })
  for (let k = 0; k < 5; k++) out.push({ color: RISE[k], from: (k * limit) / 5, to: ((k + 1) * limit) / 5 })
  return out
}
