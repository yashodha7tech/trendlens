import { scaleLinear } from 'd3-scale'
import { line as d3line } from 'd3-shape'
import { useState } from 'react'
import { MODEL, STATION } from '../lib/colors'
import { fmt } from '../lib/format'
import { useWidth } from '../lib/hooks'

interface Props {
  years: number[]
  station: number[]
  model: number[]
  unit: string
  height?: number
}

const M = { top: 14, right: 86, bottom: 28, left: 48 }

/** Yearly anomalies: weather stations (NOAA CDO) against the MERRA-2 cells they sit in. */
export default function StationChart({ years, station, model, unit, height = 260 }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const narrow = width < 520
  const m = narrow ? { ...M, right: 14 } : M
  const all = [...station, ...model].filter(Number.isFinite)
  const x = scaleLinear().domain([years[0], years[years.length - 1]]).range([m.left, Math.max(m.left + 10, width - m.right)])
  const y = scaleLinear().domain([Math.min(...all), Math.max(...all)]).range([height - m.bottom, m.top]).nice(5)
  const path = (vals: number[]) =>
    d3line<number>()
      .defined((v) => Number.isFinite(v))
      .x((_, i) => x(years[i]))
      .y((v) => y(v))(vals) ?? ''
  const ticks = y.ticks(5)
  const step = years.length > 30 ? 10 : 5
  const xt = years.filter((yv) => yv % step === 0)
  const last = years.length - 1
  const dec = Math.max(0, -Math.floor(Math.log10(Math.abs(ticks[1] - ticks[0]) || 1)))

  return (
    <div className="chart" ref={ref}>
      <div className="legend" style={{ marginBottom: 8 }}>
        <span className="key">
          <span className="line" style={{ color: STATION }} /> Weather stations (NOAA CDO)
        </span>
        <span className="key">
          <span className="line" style={{ color: MODEL }} /> MERRA-2 at the same places and months
        </span>
      </div>
      {width > 0 && (
        <svg width={width} height={height}>
          <g className="grid">
            {ticks.map((t) => (
              <line key={t} x1={m.left} x2={width - m.right} y1={y(t)} y2={y(t)} />
            ))}
          </g>
          <line x1={m.left} x2={width - m.right} y1={y(0)} y2={y(0)} stroke="#c3c2b7" />
          <g className="axis">
            {ticks.map((t) => (
              <text key={t} x={m.left - 8} y={y(t)} dy="0.32em" textAnchor="end">
                {fmt(t, dec, true)}
              </text>
            ))}
            {xt.map((t) => (
              <text key={t} x={x(t)} y={height - m.bottom + 18} textAnchor="middle">
                {t}
              </text>
            ))}
            <text x={m.left} y={m.top - 4} style={{ fontSize: 11 }}>
              {`difference from average, ${unit}`}
            </text>
          </g>
          <path d={path(model)} fill="none" stroke={MODEL} strokeWidth={2} strokeLinejoin="round" />
          <path d={path(station)} fill="none" stroke={STATION} strokeWidth={2} strokeLinejoin="round" />
          {!narrow && (
            <g style={{ fontSize: 12 }}>
              <text x={x(years[last]) + 8} y={y(station[last])} dy="0.32em" fill="#33322f">
                Stations
              </text>
              <text x={x(years[last]) + 8} y={y(model[last]) + (Math.abs(y(model[last]) - y(station[last])) < 14 ? 14 : 0)} dy="0.32em" fill="#33322f">
                MERRA-2
              </text>
            </g>
          )}
          {hover !== null && <line x1={x(years[hover])} x2={x(years[hover])} y1={m.top} y2={height - m.bottom} stroke="#0b0b0b" opacity={0.35} />}
          <rect
            x={m.left}
            y={m.top}
            width={Math.max(0, width - m.left - m.right)}
            height={height - m.top - m.bottom}
            fill="transparent"
            onPointerMove={(e) => {
              const r = (e.target as SVGRectElement).getBoundingClientRect()
              const t = x.invert(e.clientX - r.left + m.left)
              let best = 0
              years.forEach((yv, i) => {
                if (Math.abs(yv - t) < Math.abs(years[best] - t)) best = i
              })
              setHover(best)
            }}
            onPointerLeave={() => setHover(null)}
          />
        </svg>
      )}
      {hover !== null && (
        <div className="tooltip" style={{ left: Math.min(Math.max(x(years[hover]), 90), width - 90), top: y(Math.max(station[hover], model[hover])) }}>
          <div className="t-lab">{years[hover]}</div>
          <div className="t-row">
            <span className="t-key" style={{ background: STATION }} />
            <strong>{fmt(station[hover], dec + 1, true)}</strong> <span className="t-lab">stations</span>
          </div>
          <div className="t-row">
            <span className="t-key" style={{ background: MODEL }} />
            <strong>{fmt(model[hover], dec + 1, true)}</strong> <span className="t-lab">MERRA-2</span>
          </div>
        </div>
      )}
    </div>
  )
}
