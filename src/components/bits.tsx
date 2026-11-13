import { scaleLinear } from 'd3-scale'
import { useState } from 'react'
import { FALL_LINE, RISE_LINE, lineColor } from '../lib/colors'
import { dirGlyph, dirWord, direction, fmt, fmtP, verdictLabel } from '../lib/format'
import type { Analysis, SensitivityCell, Verdict } from '../lib/stats'

export function Badge({ verdict }: { verdict: Verdict }) {
  return <span className={`badge ${verdict}`}>{verdictLabel[verdict]}</span>
}

export function Dir({ slope, word = true }: { slope: number; word?: boolean }) {
  return (
    <span className={`dir ${direction(slope)}`}>
      <i aria-hidden="true">{dirGlyph(slope)}</i>
      {word && dirWord(slope)}
    </span>
  )
}

/** Annual series with its Theil-Sen line, for list rows. */
export function Sparkline({ a, width = 96, height = 30 }: { a: Analysis; width?: number; height?: number }) {
  const pts = a.annualYears.map((y, i) => ({ t: y + 0.5, v: a.annual[i] })).filter((d) => Number.isFinite(d.v))
  if (pts.length < 2) return null
  const x = scaleLinear().domain([pts[0].t, pts[pts.length - 1].t]).range([2, width - 2])
  const vs = pts.map((p) => p.v)
  const y = scaleLinear().domain([Math.min(...vs), Math.max(...vs)]).range([height - 3, 3])
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join('')
  const ta = pts[0].t
  const tb = pts[pts.length - 1].t
  const f = (t: number) => a.sen.intercept + a.sen.slope * t
  return (
    <svg width={width} height={height} aria-hidden="true" className="spark">
      <path d={d} fill="none" stroke="#c3c2b7" strokeWidth={1.25} />
      <line x1={x(ta)} x2={x(tb)} y1={y(f(ta))} y2={y(f(tb))} stroke={lineColor(a.sen.slope)} strokeWidth={2} strokeLinecap="round" />
    </svg>
  )
}

/** One square per possible start year: does the verdict hold if we start counting later? */
export function SensitivityStrip({
  cells,
  selected,
  onSelect,
  unit,
  decimals,
}: {
  cells: SensitivityCell[]
  selected?: number
  onSelect: (start: number) => void
  unit: string
  decimals: number
}) {
  const [hover, setHover] = useState<SensitivityCell | null>(null)
  if (!cells.length) return null
  const nSig = cells.filter((c) => c.significant).length
  const shown = hover ?? cells.find((c) => c.start === selected) ?? cells[0]
  return (
    <div>
      <div className="strip" style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }} role="group" aria-label="Verdict for each possible start year">
        {cells.map((c) => {
          const col = c.slope >= 0 ? RISE_LINE : FALL_LINE
          return (
            <button
              key={c.start}
              className={c.start === selected ? 'sel' : ''}
              style={c.significant ? { background: col } : { background: '#fff', boxShadow: `inset 0 0 0 1.5px ${col}` }}
              aria-label={`Start in ${c.start}: ${fmt(c.slope * 10, decimals, true)} ${unit} per decade, p ${fmtP(c.p)}, ${c.significant ? 'significant' : 'not significant'}`}
              onMouseEnter={() => setHover(c)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(c)}
              onBlur={() => setHover(null)}
              onClick={() => onSelect(c.start)}
            />
          )
        })}
      </div>
      <div className="strip-axis">
        <span>{cells[0].start}</span>
        <span>start year</span>
        <span>{cells[cells.length - 1].start}</span>
      </div>
      <p className="small" style={{ marginTop: 12 }}>
        <strong>
          Starting in {shown.start}: {fmt(shown.slope * 10, decimals, true)} {unit} per decade, p {fmtP(shown.p).startsWith('<') ? fmtP(shown.p) : `= ${fmtP(shown.p)}`}
        </strong>{' '}
        <span className="muted">· {shown.significant ? 'significant' : 'not significant'}</span>
      </p>
      <p className="small muted" style={{ marginTop: 4 }}>
        Significant for <strong style={{ color: 'var(--ink)' }}>{nSig}</strong> of {cells.length} possible start years. Filled squares are significant; outlined squares are not. Blue = rising, coral = falling. Click a square to re-run the test from that year.
      </p>
    </div>
  )
}

export function Loading({ what = 'Loading NASA data' }: { what?: string }) {
  return (
    <div className="wrap loading" role="status">
      {what}…
    </div>
  )
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div className="wrap" style={{ padding: '40px var(--gutter)' }}>
      <div className="error">{message}</div>
    </div>
  )
}
