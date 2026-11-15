import '../styles/impact.css'
import { CASE_WHY } from '../lib/impact'
import { decimalsFor, fmt, pText, unitText } from '../lib/format'
import { href } from '../lib/router'
import type { Catalog, Summary } from '../lib/types'
import { Badge, Dir } from './bits'
import { Cite } from './Impact'

type Clue = { rid: string; vid: string; label: string }
type Case = { id: keyof typeof CASE_WHY; no: string; question: string; clues: Clue[]; link: (string | number)[]; verdictNote: (s: Summary[]) => string }

const CASES: Case[] = [
  {
    id: 'amazon',
    no: '01',
    question: 'Is the southern Amazon getting hotter, drier and losing its forest?',
    clues: [
      { rid: 'samazon', vid: 't2m', label: 'Air temperature' },
      { rid: 'samazon', vid: 'precip', label: 'Rainfall' },
      { rid: 'samazon', vid: 'tree', label: 'Tree cover' },
    ],
    link: ['explore', 'samazon'],
    verdictNote: (s) => `${s.filter((x) => x.verdict === 'significant').length} of ${s.length} clues are significant: several variables, one story.`,
  },
  {
    id: 'haze',
    no: '02',
    question: 'Why is sunlight fading over India but returning over China?',
    clues: [
      { rid: 'igp', vid: 'sun', label: 'Sunlight, Indo-Gangetic Plain' },
      { rid: 'ncp', vid: 'sun', label: 'Sunlight, North China Plain' },
      { rid: 'igp', vid: 'aod', label: 'Haze (AOD), Indo-Gangetic Plain' },
    ],
    link: ['compare', 'sun', 'igp', 'ncp'],
    verdictNote: (s) =>
      s[0] && s[1] && Math.sign(s[0].slope) !== Math.sign(s[1].slope) ? 'The same variable moves in opposite directions in two places.' : 'Compare the two regions side by side.',
  },
  {
    id: 'prairies',
    no: '03',
    question: 'Are the Canadian Prairies warming?',
    clues: [{ rid: 'prairies', vid: 't2m', label: 'Air temperature' }],
    link: ['trend', 'prairies', 't2m'],
    verdictNote: (s) =>
      s[0]?.years_needed && s[0].years_needed > s[0].n_years
        ? `Not guilty yet: a trend this size needs about ${Math.round(s[0].years_needed)} years of data to stand out; we have ${s[0].n_years}.`
        : 'The test cannot rule out chance yet.',
  },
  {
    id: 'southwest',
    no: '04',
    question: 'Is the US Southwest heating up and drying out?',
    clues: [
      { rid: 'swus', vid: 't2m', label: 'Air temperature' },
      { rid: 'swus', vid: 'precip', label: 'Rainfall' },
      { rid: 'swus', vid: 'humidity', label: 'Humidity' },
    ],
    link: ['explore', 'swus'],
    verdictNote: () => 'Satellites, the MERRA-2 model and NOAA weather stations point the same way.',
  },
]

/** The detective story on Home: real results (read from catalog.json), the verdict, and why it matters. */
export default function CaseFiles({ cat }: { cat: Catalog }) {
  return (
    <section className="casefiles" aria-labelledby="casefiles-title">
      <div className="wrap">
        <div className="casefiles-head">
          <span className="eyebrow">Case files · what the detective found</span>
          <h2 id="casefiles-title">Four cases, real NASA data, honest verdicts</h2>
          <p className="lede">
            Each case starts with a question, follows the clues, reaches a verdict, and asks what it means for people. Every number below is computed
            from the published data.
          </p>
        </div>
        <div className="casefiles-grid">
          {CASES.map((c) => {
            const sums = c.clues.map((k) => cat.results[k.rid]?.[k.vid]).filter(Boolean) as Summary[]
            const why = CASE_WHY[c.id]
            return (
              <article key={c.id} className="casefile">
                <span className="casefile-no">Case {c.no}</span>
                <h3>{c.question}</h3>
                <ul className="casefile-clues">
                  {c.clues.map((k) => {
                    const s = cat.results[k.rid]?.[k.vid]
                    const meta = cat.variables[k.vid]
                    if (!s || !meta) return null
                    return (
                      <li key={k.rid + k.vid}>
                        <a href={href(['trend', k.rid, k.vid])}>{k.label}</a>
                        <span className="casefile-val">
                          <Dir slope={s.slope} word={false} /> {fmt(s.slope, decimalsFor(s.slope), true)} {unitText(meta).trim()}/decade
                        </span>
                        <span className="casefile-p">{pText(s.p)}</span>
                        <Badge verdict={s.verdict} />
                      </li>
                    )
                  })}
                </ul>
                <p className="casefile-verdict">{c.verdictNote(sums)}</p>
                <div className="casefile-why">
                  <strong>{why.title}.</strong> {why.text} <Cite ids={why.src} />
                </div>
                <a className="btn small" href={href(c.link)}>
                  Investigate <span aria-hidden="true">→</span>
                </a>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
