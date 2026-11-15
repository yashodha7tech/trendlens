import { useMemo, useState } from 'react'
import { Badge, Dir } from '../components/bits'
import CaseFiles from '../components/CaseFiles'
import { useDemos } from '../components/DemoPlayer'
import WorldMap from '../components/WorldMap'
import { FALL_LINE, RISE_LINE } from '../lib/colors'
import { LIVE_VARIABLES, geocode } from '../lib/data'
import { decimalsFor, fmt, pText, unitText } from '../lib/format'
import { useTitle } from '../lib/hooks'
import { matchQuestion } from '../lib/question'
import { href, navigate } from '../lib/router'
import type { Catalog, Summary, TopicId } from '../lib/types'

const STEPS = [
  ['Ask', 'Choose a topic and a place, or type a question such as "Is rainfall getting weaker in the Amazon?"'],
  ['Find', 'The Trend Radar tests every NASA variable for that place and ranks them by how much they changed compared with normal year-to-year swings.'],
  ['Test', 'Open a variable to see 25 to 45 years of data with the seasons removed, the Theil-Sen trend, its 95% interval and a Mann-Kendall significance test.'],
  ['Explain', 'Read the result in plain words, see where in the region it is changing, check it against weather stations and try other start years.'],
]

export default function Home({ cat }: { cat: Catalog }) {
  useTitle('')
  const { start, demos } = useDemos()
  const [topic, setTopic] = useState<TopicId | 'all'>('all')
  const [region, setRegion] = useState<string | undefined>()
  const [q, setQ] = useState('')
  const [note, setNote] = useState('')
  const regions = cat.regions
  const liveVars = Object.keys(cat.variables).filter((v) => Object.values(cat.results).some((r) => r[v]))
  const nWord = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][liveVars.length] ?? String(liveVars.length)

  const match = useMemo(() => (q.trim().length > 3 ? matchQuestion(q) : null), [q])

  async function investigate(e?: React.FormEvent) {
    e?.preventDefault()
    if (match) {
      const avail = (rid?: string) => match.variables.filter((x) => (rid ? cat.results[rid]?.[x] : LIVE_VARIABLES.includes(x)))
      const v = avail(match.region ?? region)[0]
      if (match.region) {
        if (v) navigate(['trend', match.region, v])
        else navigate(['explore', match.region], { topic: match.topic })
        return
      }
      if (match.placeText) {
        setNote(`Looking up "${match.placeText}"…`)
        try {
          const g = await geocode(match.placeText)
          if (g) {
            navigate(['anywhere'], { lat: g.lat.toFixed(3), lon: g.lon.toFixed(3), name: g.name, v: avail()[0] })
            return
          }
          setNote(`Couldn't find a place called "${match.placeText}". Try a featured region or click the map.`)
        } catch {
          setNote('The place search is unavailable right now. Pick a region or click the map instead.')
        }
        return
      }
      if (region) {
        if (v) navigate(['trend', region, v])
        else navigate(['explore', region], { topic: match.topic })
        return
      }
      setNote('Which place? Pick a region below, click the map, or add "in <place>" to your question.')
      return
    }
    if (region) navigate(['explore', region], { topic: topic === 'all' ? undefined : topic })
    else setNote('Pick a region first, or click anywhere on the map.')
  }

  const understood = match
    ? [match.variables.map((v) => cat.variables[v].short).join(', '), match.region ? regions[match.region].name : match.placeText]
        .filter(Boolean)
        .join(' · ')
    : ''

  return (
    <>
      <section className="hero on-dark">
        <div className="wrap">
          <div>
            <span className="eyebrow">NASA Space Apps 2026 · Earth System Trend Detective</span>
            <h1>Is it really changing?</h1>
            <p className="lede">
              Pick a place and a question. TrendLens scans {nWord} NASA Earth variables, ranks what has changed since 1981, and tells you honestly
              whether each change is statistically significant or could still be chance.
            </p>
            <form className="ask" onSubmit={investigate}>
              <div className="ask-step">
                <span className="n">01</span>
                <div>
                  <h4>What are you curious about?</h4>
                  <div className="chips" role="group" aria-label="Topic">
                    <button type="button" className="chip" aria-pressed={topic === 'all'} onClick={() => setTopic('all')}>
                      Everything
                    </button>
                    {(Object.entries(cat.topics) as [TopicId, string][]).map(([id, label]) => (
                      <button type="button" key={id} className="chip" aria-pressed={topic === id} onClick={() => setTopic(id)}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="ask-step">
                <span className="n">02</span>
                <div>
                  <h4>Where?</h4>
                  <div className="region-pick">
                    {Object.entries(regions).map(([id, r]) => (
                      <button type="button" key={id} className="region-opt" aria-pressed={region === id} onClick={() => setRegion(id)}>
                        {r.name}
                        <small>{r.country.split('(')[0].trim()}</small>
                      </button>
                    ))}
                  </div>
                  <p className="tiny" style={{ marginTop: 8, color: 'var(--night-text)' }}>
                    Or click anywhere on the map to investigate any spot on Earth with live NASA POWER data.
                  </p>
                </div>
              </div>
              <div className="ask-step">
                <span className="n">03</span>
                <div>
                  <h4>Or ask in your own words</h4>
                  <div className="qbox">
                    <input
                      type="search"
                      value={q}
                      onChange={(e) => {
                        setQ(e.target.value)
                        setNote('')
                      }}
                      placeholder="Is it getting hazier over Delhi?"
                      aria-label="Your question"
                    />
                  </div>
                  <p className="match-note" aria-live="polite">
                    {note || (understood ? `Understood: ${understood}` : '')}
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', paddingLeft: 40 }}>
                <button className="btn light arrow" type="submit">
                  Find what's changing
                </button>
                <button
                  type="button"
                  className="btn ghost on-dark"
                  onClick={() => {
                    const el = document.getElementById('demos')
                    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 70, behavior: 'smooth' })
                  }}
                >
                  Watch a demo
                </button>
              </div>
            </form>
          </div>
          <div>
            <div className="hero-map" aria-label="Map of featured regions. Click a box to explore it, or anywhere to investigate that point.">
              <WorldMap
                regions={regions}
                selected={region}
                onRegion={(id) => navigate(['explore', id], { topic: topic === 'all' ? undefined : topic })}
                onPoint={(lat, lon) => navigate(['anywhere'], { lat: lat.toFixed(3), lon: lon.toFixed(3) })}
              />
            </div>
            <Headlines cat={cat} />
          </div>
        </div>
      </section>

      <CaseFiles cat={cat} />

      <section className="section" id="demos">
        <div className="wrap">
          <div className="section-head">
            <div>
              <span className="eyebrow">Watch first</span>
              <h2>Three cases, solved with real data</h2>
            </div>
            <p className="muted small" style={{ maxWidth: '46ch' }}>
              Each demo walks through a real investigation step by step: one clear trend, one that is not significant yet, and one variable moving in
              opposite directions in two regions.
            </p>
          </div>
          <div className="grid-3">
            <DemoCard
              kicker="A clear trend"
              title="Is the southern Amazon getting hotter and drier?"
              s={cat.results.samazon?.t2m}
              unit="°C"
              label="Air temperature"
              onWatch={() => start('clear-trend')}
              ready={!!demos}
              link={href(['trend', 'samazon', 't2m'])}
            />
            <DemoCard
              kicker="Not significant yet"
              title="Are the Canadian Prairies warming significantly?"
              s={cat.results.prairies?.t2m}
              unit="°C"
              label="Air temperature"
              onWatch={() => start('not-yet')}
              ready={!!demos}
              link={href(['trend', 'prairies', 't2m'])}
            />
            <OppositeCard cat={cat} onWatch={() => start('opposite')} ready={!!demos} />
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="section-head">
            <div>
              <span className="eyebrow">At a glance</span>
              <h2>What is changing where?</h2>
            </div>
            <p className="muted small" style={{ maxWidth: '48ch' }}>
              Every square is one full trend test on 25 to 45 years of data. Filled = significant, outlined = a tendency that is not significant yet,
              dash = no clear trend. Select a square to see the evidence.
            </p>
          </div>
          <Matrix cat={cat} />
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="section-head">
            <div>
              <span className="eyebrow">How it works</span>
              <h2>Four steps, like a detective</h2>
            </div>
          </div>
          <div className="grid-4">
            {STEPS.map(([t, d], i) => (
              <div className="step" key={t}>
                <span className="n">0{i + 1}</span>
                <h3>{t}</h3>
                <p>{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="section-head">
            <div>
              <span className="eyebrow">The clues</span>
              <h2>
                {nWord[0].toUpperCase() + nWord.slice(1)} variables from NASA satellites and models
              </h2>
            </div>
            <a className="btn ghost small arrow" href="#/sources">
              Datasets and citations
            </a>
          </div>
          <div className="grid-4">
            {liveVars.map((id) => [id, cat.variables[id]] as const).map(([id, v]) => (
              <div className="var-card" key={id}>
                <span className="eyebrow">{cat.topics[v.topic]}</span>
                <h4>{v.name}</h4>
                <p className="small" style={{ color: 'var(--ink-2)' }}>
                  {v.definition}
                </p>
                <span className="src">
                  {v.source.split(',')[0]} · since {v.start}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}

/** The strongest significant trend in each featured region. */
function Headlines({ cat }: { cat: Catalog }) {
  return (
    <div className="headlines">
      <span className="eyebrow" style={{ color: '#9d9c95', margin: '12px 0 6px', display: 'block' }}>
        Strongest trend found in each region
      </span>
      {Object.entries(cat.regions).map(([rid, r]) => {
        const res = Object.entries(cat.results[rid] ?? {}).filter(([, s]) => s.verdict === 'significant')
        if (!res.length) return null
        const [vid, s] = res.sort((a, b) => b[1].snr - a[1].snr)[0]
        const v = cat.variables[vid]
        return (
          <a key={rid} href={href(['trend', rid, vid])}>
            <span>
              <strong>{r.name}</strong> · {v.name.toLowerCase()}
            </span>
            <span className="hv">
              <Dir slope={s.slope} word={false} /> {fmt(s.slope, decimalsFor(s.slope), true)}
              {unitText(v)}/decade
            </span>
          </a>
        )
      })}
    </div>
  )
}

function DemoCard(props: { kicker: string; title: string; s?: Summary; unit: string; label: string; onWatch: () => void; ready: boolean; link: string }) {
  const { s } = props
  return (
    <div className="case">
      <span className="eyebrow">{props.kicker}</span>
      <h3>{props.title}</h3>
      {s && (
        <div>
          <div className="stat">
            <Dir slope={s.slope} word={false} /> {fmt(s.slope, decimalsFor(s.slope), true)} {props.unit}
            <span className="muted" style={{ fontSize: 15, fontWeight: 500 }}>
              {' '}
              per decade
            </span>
          </div>
          <p className="small muted" style={{ marginTop: 4 }}>
            {props.label}, {s.first}–{s.last} · {pText(s.p)}
          </p>
          <div style={{ marginTop: 8 }}>
            <Badge verdict={s.verdict} />
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
        <button className="btn small" onClick={props.onWatch} disabled={!props.ready}>
          Watch demo
        </button>
        <a className="btn small ghost" href={props.link}>
          Open result
        </a>
      </div>
    </div>
  )
}

function OppositeCard({ cat, onWatch, ready }: { cat: Catalog; onWatch: () => void; ready: boolean }) {
  const a = cat.results.igp?.sun
  const b = cat.results.ncp?.sun
  const u = unitText(cat.variables.sun).trim()
  return (
    <div className="case">
      <span className="eyebrow">Opposite directions</span>
      <h3>Why is sunlight falling over India but rising over China?</h3>
      {a && b && (
        <div style={{ display: 'grid', gap: 6 }}>
          <div className="small">
            <Dir slope={a.slope} word={false} /> <strong>{fmt(a.slope, decimalsFor(a.slope), true)}</strong> {u}/decade · Indo-Gangetic Plain
          </div>
          <div className="small">
            <Dir slope={b.slope} word={false} /> <strong>{fmt(b.slope, decimalsFor(b.slope), true)}</strong> {u}/decade · North China Plain
          </div>
          <p className="small muted">
            Sunlight reaching the ground, {a.first}–{a.last}
          </p>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
        <button className="btn small" onClick={onWatch} disabled={!ready}>
          Watch demo
        </button>
        <a className="btn small ghost" href={href(['compare', 'sun', 'igp', 'ncp'])}>
          Compare
        </a>
      </div>
    </div>
  )
}

function Matrix({ cat }: { cat: Catalog }) {
  const regionIds = Object.keys(cat.regions)
  const varIds = Object.keys(cat.variables).filter((v) => regionIds.some((r) => cat.results[r]?.[v]))
  return (
    <div className="table-scroll">
      <table className="table matrix">
        <thead>
          <tr>
            <th>Variable</th>
            {regionIds.map((r) => (
              <th key={r} style={{ textAlign: 'center' }}>
                {cat.regions[r].name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {varIds.map((v) => (
            <tr key={v}>
              <td>
                <strong style={{ fontWeight: 600 }}>{cat.variables[v].name}</strong>
                <div className="tiny muted">since {cat.variables[v].start}</div>
              </td>
              {regionIds.map((r) => {
                const s = cat.results[r]?.[v]
                if (!s)
                  return (
                    <td key={r} style={{ textAlign: 'center' }} className="muted tiny">
                      loading
                    </td>
                  )
                const col = s.slope >= 0 ? RISE_LINE : FALL_LINE
                const label = `${cat.variables[v].name}, ${cat.regions[r].name}: ${s.slope >= 0 ? 'rising' : 'falling'}, ${s.verdict.replace('_', ' ')}, ${pText(s.p)}`
                return (
                  <td key={r} style={{ textAlign: 'center' }}>
                    <a className="cell" href={href(['trend', r, v])} aria-label={label} title={label}>
                      {s.verdict === 'none' ? (
                        <span className="cell-none">–</span>
                      ) : (
                        <span
                          className="cell-sq"
                          style={s.verdict === 'significant' ? { background: col } : { boxShadow: `inset 0 0 0 2px ${col}` }}
                        >
                          <span style={{ color: s.verdict === 'significant' ? '#fff' : col }}>{s.slope >= 0 ? '▲' : '▼'}</span>
                        </span>
                      )}
                    </a>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
