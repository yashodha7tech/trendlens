/**
 * "Check it yourself": the challenge's NASA and partner tools that can reproduce or extend a result,
 * chosen by variable, with the place's coordinates ready to paste.
 */
const MODIS = new Set(['tree', 'ndvi'])
const HYDRO = new Set(['precip', 'soil', 'evap'])
const STATION = new Set(['t2m', 'tmax', 'precip'])

export default function CrossCheck({ vid, bbox, point }: { vid: string; bbox?: [number, number, number, number]; point?: [number, number] }) {
  const where = bbox
    ? `${bbox[0]}° to ${bbox[1]}° latitude, ${bbox[2]}° to ${bbox[3]}° longitude`
    : point
      ? `${point[0].toFixed(2)}° latitude, ${point[1].toFixed(2)}° longitude`
      : ''
  const wv = bbox ? `https://worldview.earthdata.nasa.gov/?v=${bbox[2]},${bbox[0]},${bbox[3]},${bbox[1]}` : 'https://worldview.earthdata.nasa.gov/'
  const tools: { name: string; url: string; why: string }[] = [
    { name: 'NASA Giovanni', url: 'https://giovanni.gsfc.nasa.gov/giovanni/', why: 'Plot an area-averaged time series of the same NASA product (MERRA-2, MODIS or CERES) and download it.' },
  ]
  if (MODIS.has(vid)) tools.push({ name: 'AppEEARS', url: 'https://appeears.earthdatacloud.nasa.gov/', why: 'Extract the same MODIS product for this area at full resolution.' })
  if (HYDRO.has(vid))
    tools.push({ name: 'Hydrology Time Series (GES DISC)', url: 'https://disc.gsfc.nasa.gov/information/tools?title=Hydrology%20Time%20Series', why: 'Compare with GLDAS and NLDAS land models for the same place.' })
  if (STATION.has(vid)) tools.push({ name: 'NOAA Climate Data Online', url: 'https://www.ncei.noaa.gov/cdo-web/', why: 'Find the weather stations behind our station check and their full records.' })
  tools.push({ name: 'KNMI Climate Explorer', url: 'https://climexp.knmi.nl/', why: 'Test the trend against other climate datasets and indices.' })
  tools.push({ name: 'NASA Worldview', url: wv, why: 'See daily satellite imagery of this area, opened at this box.' })

  return (
    <div className="crosscheck">
      <span className="eyebrow">Check it yourself</span>
      <h3 style={{ margin: '10px 0 8px' }}>Reproduce this with other tools</h3>
      {where && (
        <p className="small" style={{ color: 'var(--ink-2)' }}>
          Use the same place: <span className="mono">{where}</span>
        </p>
      )}
      <ul className="crosscheck-list">
        {tools.map((t) => (
          <li key={t.name}>
            <a href={t.url} target="_blank" rel="noreferrer">
              {t.name}
            </a>
            <span className="small">{t.why}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
