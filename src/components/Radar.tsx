import { Badge, Dir, Sparkline } from './bits'
import { fmtP, rate, unitText } from '../lib/format'
import type { Analysis } from '../lib/stats'
import type { Catalog, TopicId } from '../lib/types'

export interface RadarItem {
  id: string
  a: Analysis
}

/** Rank variables by signal-to-noise: total change over the record divided by year-to-year variability. */
export function rankItems(analyses: Record<string, Analysis>): RadarItem[] {
  return Object.entries(analyses)
    .map(([id, a]) => ({ id, a }))
    .sort((x, y) => y.a.snr - x.a.snr)
}

interface Props {
  cat: Catalog
  items: RadarItem[]
  topic: TopicId | 'all'
  selected?: string
  onSelect: (id: string) => void
}

export default function Radar({ cat, items, topic, selected, onSelect }: Props) {
  return (
    <div className="radar" role="list" aria-label="Variables ranked by strength of change">
      {items.map((it, rank) => {
        const meta = cat.variables[it.id]
        if (topic !== 'all' && meta.topic !== topic) return null
        const r = rate(it.a, meta)
        return (
          <button key={it.id} role="listitem" className="radar-row" aria-current={selected === it.id} onClick={() => onSelect(it.id)}>
            <span className="rank">{String(rank + 1).padStart(2, '0')}</span>
            <span>
              <span className="vname">{meta.name}</span>
              <span className="vdef" style={{ display: 'block' }}>
                {meta.definition}
              </span>
            </span>
            <span className="spark">
              <Sparkline a={it.a} />
            </span>
            <span className="rate">
              <Dir slope={it.a.sen.slope} word={false} /> <strong>{r.value}{unitText(meta)}</strong>
              <small>per decade{r.ofAverage ? ` · ${r.ofAverage}` : ''}</small>
              <small>
                p {fmtP(it.a.mk.p).startsWith('<') ? fmtP(it.a.mk.p) : `= ${fmtP(it.a.mk.p)}`} · {it.a.first}–{it.a.last}
              </small>
            </span>
            <span>
              <Badge verdict={it.a.verdict} />
            </span>
          </button>
        )
      })}
    </div>
  )
}
