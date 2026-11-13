import { scaleLinear } from 'd3-scale'
import { line as d3line } from 'd3-shape'
import { useMemo, useState } from 'react'
import { lineColor } from '../lib/colors'
import { fmt, rate, unitText, valueUnit } from '../lib/format'
import { useWidth } from '../lib/hooks'
import type { Analysis } from '../lib/stats'
import type { VariableMeta } from '../lib/types'

interface Props {
  years: number[]
  months?: number[]
  raw: (number | null)[]
  /** analysis of the full record, used for the deseasonalized line */
  full: Analysis
  /** analysis of the chosen period (may equal full) */
  analysis: Analysis
  meta: VariableMeta
  view: 'deseasonalized' | 'raw'
  from?: number
  height?: number
  label?: string
}

const M = { top: 18, right: 112, bottom: 30, left: 54 }
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default function TimeSeriesChart({ years, months, raw, full, analysis, meta, view, from, height = 340, label }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const monthly = !!months
  const narrow = width < 560
  const m = narrow ? { ...M, right: 16, left: 46 } : M

  const pts = useMemo(() => {
    const vals = view === 'raw' || !monthly ? raw : full.deseasonalized
    return years.map((y, i) => ({ t: monthly ? y + (months![i] - 0.5) / 12 : y + 0.5, v: vals[i] ?? NaN, i }))
  }, [years, months, raw, full, view, monthly])

  const annual = useMemo(
    () => full.annualYears.map((y, i) => ({ t: y + 0.5, v: full.annual[i] })).filter((d) => Number.isFinite(d.v)),
    [full],
  )

  const t0 = years[0]
  const t1 = years[years.length - 1] + 1
  const finite = pts.filter((p) => Number.isFinite(p.v)).map((p) => p.v)
  const { sen } = analysis
  const tA = Math.max(analysis.first, from ?? -Infinity)
  const tB = analysis.last + 1
  // bow-tie band: plausible trend lines pivot on the (median time, median value) point
  const okT = analysis.annualYears.filter((_, i) => Number.isFinite(analysis.annual[i])).map((y) => y + 0.5)
  const tMed = median(okT)
  const yMed = sen.intercept + sen.slope * tMed
  const bandAt = (t: number) => [yMed + sen.low * (t - tMed), yMed + sen.high * (t - tMed)]
  const trendAt = (t: number) => sen.intercept + sen.slope * t
  const extent = [...finite, ...bandAt(tA), ...bandAt(tB)]
  const lo = Math.min(...extent)
  const hi = Math.max(...extent)
  const pad = (hi - lo) * 0.06 || 1

  const x = scaleLinear().domain([t0, t1]).range([m.left, Math.max(m.left + 10, width - m.right)])
  const y = scaleLinear().domain([lo - pad, hi + pad]).range([height - m.bottom, m.top]).nice(5)
  const yTicks = y.ticks(5)
  const span = t1 - t0
  const step = span > 30 ? 10 : 5
  const xTicks: number[] = []
  for (let t = Math.ceil(t0 / step) * step; t <= t1; t += step) xTicks.push(t)

  const path = d3line<{ t: number; v: number }>()
    .defined((d) => Number.isFinite(d.v))
    .x((d) => x(d.t))
    .y((d) => y(d.v))
  const color = lineColor(sen.slope)
  const r = rate(analysis, meta)
  const dec = Math.max(meta.decimals - 1, 1)

  const band = [
    [tA, Math.max(...bandAt(tA))],
    [tMed, yMed],
    [tB, Math.max(...bandAt(tB))],
    [tB, Math.min(...bandAt(tB))],
    [tMed, yMed],
    [tA, Math.min(...bandAt(tA))],
  ]
    .map(([t, v], k) => `${k ? 'L' : 'M'}${x(t)},${y(v)}`)
    .join('') + 'Z'

  function onMove(e: React.PointerEvent<SVGRectElement>) {
    const rect = (e.target as SVGRectElement).getBoundingClientRect()
    const t = x.invert(e.clientX - rect.left + m.left)
    let best = 0
    let bd = Infinity
    pts.forEach((p, k) => {
      const d = Math.abs(p.t - t)
      if (d < bd) {
        bd = d
        best = k
      }
    })
    setHover(best)
  }

  const hp = hover !== null ? pts[hover] : null
  const hYear = hp ? years[hp.i] : null
  const hAnnual = hYear !== null ? full.annual[full.annualYears.indexOf(hYear)] : undefined

  return (
    <div className="chart" ref={ref} aria-label={label}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={label}>
          <g className="grid">
            {yTicks.map((t) => (
              <line key={t} x1={m.left} x2={width - m.right} y1={y(t)} y2={y(t)} />
            ))}
          </g>
          <g className="axis">
            {yTicks.map((t) => (
              <text key={t} x={m.left - 8} y={y(t)} dy="0.32em" textAnchor="end">
                {fmt(t, decimalsForTicks(yTicks))}
              </text>
            ))}
            {xTicks.map((t) => (
              <text key={t} x={x(t)} y={height - m.bottom + 18} textAnchor="middle">
                {t}
              </text>
            ))}
            <text x={m.left} y={m.top - 6} style={{ fontSize: 11 }}>
              {meta.unit === 'fraction' ? '0–1 scale' : meta.unit === '%' ? '% of ground' : meta.unit}
            </text>
          </g>
          <line className="baseline" x1={m.left} x2={width - m.right} y1={height - m.bottom} y2={height - m.bottom} />
          {from && from > t0 && (
            <g>
              <rect x={x(t0)} y={m.top} width={x(from) - x(t0)} height={height - m.top - m.bottom} fill="#f6f5f1" />
              <text x={x(t0) + 6} y={m.top + 14} className="mono" style={{ fontSize: 11, fill: '#8f8d86' }}>
                not used
              </text>
            </g>
          )}
          <path d={path(pts) ?? ''} fill="none" stroke={view === 'raw' ? '#a9a79f' : '#c3c2b7'} strokeWidth={1.25} strokeLinejoin="round" />
          {view !== 'raw' && monthly && (
            <g>
              {annual.map((d) => (
                <circle key={d.t} cx={x(d.t)} cy={y(d.v)} r={3.5} fill="#33322f" stroke="#fff" strokeWidth={1.5} opacity={from && d.t < from ? 0.35 : 1} />
              ))}
            </g>
          )}
          {!monthly &&
            annual.map((d) => <circle key={d.t} cx={x(d.t)} cy={y(d.v)} r={4} fill="#33322f" stroke="#fff" strokeWidth={2} opacity={from && d.t < from ? 0.35 : 1} />)}
          <path d={band} fill={color} opacity={0.16} />
          <line x1={x(tA)} x2={x(tB)} y1={y(trendAt(tA))} y2={y(trendAt(tB))} stroke={color} strokeWidth={2.5} strokeLinecap="round" />
          {!narrow && (
            <g>
              <text x={x(tB) + 8} y={y(trendAt(tB))} dy="-0.2em" style={{ fontSize: 13, fontWeight: 600, fill: '#0b0b0b' }}>
                {r.value}
              </text>
              <text x={x(tB) + 8} y={y(trendAt(tB))} dy="1.05em" style={{ fontSize: 11.5, fill: '#66645f' }}>
                {`${unitText(meta).trim() || 'units'}/decade`}
              </text>
            </g>
          )}
          {hp && Number.isFinite(hp.v) && (
            <g pointerEvents="none">
              <line x1={x(hp.t)} x2={x(hp.t)} y1={m.top} y2={height - m.bottom} stroke="#0b0b0b" strokeWidth={1} opacity={0.4} />
              <circle cx={x(hp.t)} cy={y(hp.v)} r={4.5} fill="#0b0b0b" stroke="#fff" strokeWidth={2} />
            </g>
          )}
          <rect
            x={m.left}
            y={m.top}
            width={Math.max(0, width - m.left - m.right)}
            height={height - m.top - m.bottom}
            fill="transparent"
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
          />
        </svg>
      )}
      {hp && Number.isFinite(hp.v) && hYear !== null && (
        <div className="tooltip" style={{ left: Math.min(Math.max(x(hp.t), 90), width - 90), top: y(hp.v) }}>
          <div className="t-lab">{monthly ? `${MONTHS[months![hp.i] - 1]} ${hYear}` : hYear}</div>
          <div>
            <strong>{fmt(raw[hp.i], dec + 1)}</strong>
            <span className="t-lab">{valueUnit(meta)} measured</span>
          </div>
          {monthly && (
            <div className="t-row">
              <span className="t-lab">without seasons</span> {fmt(full.deseasonalized[hp.i], dec + 1)}
            </div>
          )}
          {monthly && hAnnual !== undefined && Number.isFinite(hAnnual) && (
            <div className="t-row">
              <span className="t-lab">{hYear} average</span> {fmt(hAnnual, dec + 1)}
            </div>
          )}
          <div className="t-row">
            <span className="t-key" style={{ background: color }} />
            <span className="t-lab">trend line</span> {fmt(trendAt(hp.t), dec + 1)}
          </div>
        </div>
      )}
    </div>
  )
}

function median(a: number[]): number {
  const s = [...a].sort((x, y) => x - y)
  const h = Math.floor(s.length / 2)
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2
}

function decimalsForTicks(ticks: number[]): number {
  if (ticks.length < 2) return 1
  const stepv = Math.abs(ticks[1] - ticks[0])
  return Math.max(0, Math.min(4, -Math.floor(Math.log10(stepv) + 1e-9)))
}
