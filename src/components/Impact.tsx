import '../styles/impact.css'
import { AREA_LABEL, SOURCES, framing, regionContext, variableImpact, type SourceId } from '../lib/impact'
import type { Analysis } from '../lib/stats'

/** Inline source credits that link to the original publication. */
export function Cite({ ids }: { ids: SourceId[] }) {
  return (
    <span className="cite">
      {ids.map((id) => (
        <a key={id} href={SOURCES[id].url} target="_blank" rel="noreferrer" title={SOURCES[id].cite}>
          {SOURCES[id].short}
        </a>
      ))}
    </span>
  )
}

/**
 * "Why this matters" for one result. The test says WHETHER the variable changed; everything here is
 * context from published research, framed conditionally when the trend is not (yet) significant.
 */
export function ImpactPanel(props: { vid: string; name: string; placeName: string; regionId?: string; a: Analysis }) {
  const { vid, name, placeName, regionId, a } = props
  const imp = variableImpact(vid)
  const f = framing({ variable: name, place: placeName, verdict: a.verdict, slope: a.sen.slope, nYears: a.nYears, yearsNeeded: a.yearsNeeded })
  const region = regionContext(regionId)

  return (
    <div className="impact">
      <div className="impact-head">
        <span className="eyebrow">Impact · why this matters</span>
        <h3>{f.conditional ? 'What would matter if this continues' : 'What a change like this means for people'}</h3>
        <p className="impact-reading">{f.reading}</p>
      </div>

      <div className="impact-grid">
        {f.show.map((d) => {
          const dir = imp[d]
          return (
            <div key={d} className="impact-dir">
              <p className="impact-lead">
                {f.show.length > 1 && <strong>If it {d === 'rising' ? 'rises' : 'falls'}: </strong>}
                {dir.lead.text} <Cite ids={dir.lead.src} />
              </p>
              <ul className="impact-points">
                {dir.points.map((pt, i) => (
                  <li key={i}>
                    <span className={`impact-area area-${pt.area}`}>{AREA_LABEL[pt.area]}</span>
                    <span>
                      {pt.text} <Cite ids={pt.src} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}

        <div className="impact-side">
          <div>
            <span className="eyebrow">Who is affected</span>
            <p>
              {imp.people.text} <Cite ids={imp.people.src} />
            </p>
          </div>
          {imp.uses.length > 0 && (
            <div>
              <span className="eyebrow">How people use this information</span>
              <ul className="impact-uses">
                {imp.uses.map((u, i) => (
                  <li key={i}>
                    <strong>{u.kind}.</strong> {u.text} <Cite ids={u.src} />
                  </li>
                ))}
              </ul>
            </div>
          )}
          {region && (
            <div>
              <span className="eyebrow">About this place</span>
              <p>
                {region.text} <Cite ids={region.src} />
              </p>
              {region.people && (
                <p style={{ marginTop: 6 }}>
                  {region.people.text} <Cite ids={region.people.src} />
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <p className="impact-scope">{f.scope}</p>
    </div>
  )
}
