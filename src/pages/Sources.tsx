import { useTitle } from '../lib/hooks'
import { sourcesByOrg } from '../lib/impact'
import type { Catalog } from '../lib/types'

const DATASETS: { name: string; vars: string; via: string; detail: string; cite: string; url: string; needs?: string }[] = [
  {
    name: 'MERRA-2 reanalysis',
    vars: 'Air temperature, rainfall, root-zone soil wetness, land evaporation',
    via: 'NASA POWER API (monthly, regional and point)',
    detail: '0.5° × 0.625° grid, January 1981 – December 2025',
    cite: 'Gelaro, R., et al. (2017). The Modern-Era Retrospective Analysis for Research and Applications, Version 2 (MERRA-2). Journal of Climate, 30, 5419–5454.',
    url: 'https://gmao.gsfc.nasa.gov/reanalysis/MERRA-2/',
  },
  {
    name: 'CERES SYN1deg',
    vars: 'Sunlight reaching the ground; aerosol optical depth (MODIS aerosols assimilated)',
    via: 'NASA POWER API',
    detail: '1° × 1° grid, January 2001 – December 2025',
    cite: 'Doelling, D. R., et al. (2013). Geostationary enhanced temporal interpolation for CERES flux products. Journal of Atmospheric and Oceanic Technology, 30, 1072–1090.',
    url: 'https://ceres.larc.nasa.gov/data/',
  },
  {
    name: 'MODIS Terra MOD13Q1 v061',
    needs: 'ndvi',
    vars: 'Vegetation greenness (NDVI)',
    via: 'ORNL DAAC MODIS web service',
    detail: '250 m, 16-day composites → monthly maximum, 2001–2025, nine 2 × 2 km sites per region',
    cite: 'Didan, K. (2021). MODIS/Terra Vegetation Indices 16-Day L3 Global 250m SIN Grid V061. NASA EOSDIS Land Processes DAAC. doi:10.5067/MODIS/MOD13Q1.061',
    url: 'https://lpdaac.usgs.gov/products/mod13q1v061/',
  },
  {
    name: 'MODIS Terra MOD44B v061',
    vars: 'Tree cover',
    via: 'ORNL DAAC MODIS web service',
    detail: '250 m, yearly, 2000–2025, nine 2 × 2 km sites per region',
    cite: 'DiMiceli, C., et al. (2022). MODIS/Terra Vegetation Continuous Fields Yearly L3 Global 250m SIN Grid V061. NASA EOSDIS Land Processes DAAC. doi:10.5067/MODIS/MOD44B.061',
    url: 'https://lpdaac.usgs.gov/products/mod44bv061/',
  },
  {
    name: 'NOAA Global Summary of the Month',
    vars: 'Station air temperature and precipitation (cross-check)',
    via: 'NOAA NCEI Climate Data Online, Access Data Service',
    detail: 'Stations with at least 70% of months filled, 1981–2025',
    cite: 'Lawrimore, J. H., et al. (2016). Global Summary of the Month (GSOM), Version 1. NOAA National Centers for Environmental Information.',
    url: 'https://www.ncei.noaa.gov/cdo-web/',
  },
  {
    name: 'NASA GIBS imagery',
    vars: 'Map backgrounds: Blue Marble relief, MODIS Terra true colour, coastlines and labels',
    via: 'GIBS WMTS (Web Mercator)',
    detail: 'Near-real-time MODIS imagery from a few days ago',
    cite: "We acknowledge the use of imagery from NASA's Global Imagery Browse Services (GIBS), part of NASA's Earth Science Data and Information System (ESDIS).",
    url: 'https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api',
  },
]

const RESOURCES: { name: string; url: string; how: string }[] = [
  {
    name: 'Climate Data Online (CDO), NOAA NCEI',
    url: 'https://www.ncei.noaa.gov/cdo-web/',
    how: 'Weather-station records (GSOM) are the independent ground truth for every temperature and rainfall trend: cached for the featured regions and fetched live for the nearest station anywhere on Earth.',
  },
  {
    name: 'Time-Series Analysis of Remotely-Sensed SeaWiFS Chlorophyll in River-Influenced Coastal Regions (Acker et al., 2009)',
    url: 'https://ntrs.nasa.gov/api/citations/20090042747/downloads/20090042747.pdf',
    how: 'Our core recipe follows its trend method: subtract the mean monthly value to make monthly anomalies, average them into yearly anomalies, then test the trend. It also showed river regions trending in opposite directions, which inspired our comparison view.',
  },
  {
    name: 'A Comprehensive Guide to Statistical Significance (Statsig)',
    url: 'https://www.statsig.com/perspectives/a-comprehensive-guide-to-statistical-significance',
    how: 'Shaped how we explain p-values, the choice of a 0.05 significance level and confidence intervals in plain language, including the ways p-values are commonly misread.',
  },
]

const REFS = [
  'Acker, J. G., McMahon, E., Shen, S., Hearty, T., & Casey, N. (2009). Time-series analysis of remotely-sensed SeaWiFS chlorophyll in river-influenced coastal regions. EARSeL eProceedings.',
  'Benjamini, Y., & Hochberg, Y. (1995). Controlling the false discovery rate: a practical and powerful approach to multiple testing. Journal of the Royal Statistical Society B, 57, 289–300.',
  'Hamed, K. H., & Rao, A. R. (1998). A modified Mann-Kendall trend test for autocorrelated data. Journal of Hydrology, 204, 182–196.',
  'Kendall, M. G. (1975). Rank Correlation Methods. Griffin, London.',
  'Mann, H. B. (1945). Nonparametric tests against trend. Econometrica, 13, 245–259.',
  'Marriott, F. H. C., & Pope, J. A. (1954). Bias in the estimation of autocorrelations. Biometrika, 41, 390–402.',
  'Matalas, N. C., & Langbein, W. B. (1962). Information content of the mean. Journal of Geophysical Research, 67, 3441–3448.',
  'Santer, B. D., et al. (2000). Statistical significance of trends and trend differences in layer-average atmospheric temperature time series. Journal of Geophysical Research, 105, 7337–7356.',
  'Sen, P. K. (1968). Estimates of the regression coefficient based on Kendall\'s tau. Journal of the American Statistical Association, 63, 1379–1389.',
  'Weatherhead, E. C., et al. (1998). Factors affecting the detection of trends: statistical considerations and applications to environmental data. Journal of Geophysical Research, 103, 17149–17161.',
  'Wilks, D. S. (2016). "The stippling shows statistically significant grid points": how research results are routinely overstated and overinterpreted, and what to do about it. Bulletin of the American Meteorological Society, 97, 2263–2273.',
  'Yue, S., & Wang, C. (2004). The Mann-Kendall test modified by effective sample size to detect trend in serially correlated hydrological series. Water Resources Management, 18, 201–218.',
]


type Use = 'Used' | 'Equivalent used' | 'Linked' | 'Not used'
const CHALLENGE: { name: string; url: string; use: Use; how: string }[] = [
  { name: 'Climate Data Online (NOAA NCEI)', url: 'https://www.ncei.noaa.gov/cdo-web/', use: 'Used', how: 'Weather-station records (GSOM) cross-check every featured temperature and rainfall trend, and Anywhere mode fetches the nearest station live.' },
  { name: 'Acker et al. (2009), SeaWiFS chlorophyll time-series analysis', url: 'https://ntrs.nasa.gov/api/citations/20090042747/downloads/20090042747.pdf', use: 'Used', how: 'Our recipe follows it: monthly values, seasonal cycle removed, yearly anomalies, then a trend test with a significance level.' },
  { name: 'A Comprehensive Guide to Statistical Significance (Statsig)', url: 'https://www.statsig.com/perspectives/a-comprehensive-guide-to-statistical-significance', use: 'Used', how: 'Shapes how p-values, the 5% level and confidence intervals are explained on the Method page and in every verdict sentence.' },
  { name: 'Giovanni (NASA GES DISC)', url: 'https://giovanni.gsfc.nasa.gov/', use: 'Equivalent used', how: 'TrendLens gets the same MERRA-2 and CERES records through NASA POWER (no login, browser-friendly). Every result page links to Giovanni to reproduce the area-averaged series.' },
  { name: 'AppEEARS (NASA LP DAAC)', url: 'https://appeears.earthdatacloud.nasa.gov/', use: 'Equivalent used', how: 'MODIS tree cover (MOD44B) and greenness (MOD13Q1) come from the ORNL DAAC MODIS web service, which serves the same products without a login. MODIS result pages link to AppEEARS for full-resolution extracts.' },
  { name: 'Hydrology Time Series (GES DISC)', url: 'https://disc.gsfc.nasa.gov/information/tools?title=Hydrology%20Time%20Series', use: 'Equivalent used', how: 'Soil wetness, evaporation and rainfall come from MERRA-2 via NASA POWER; their result pages link to Hydrology Time Series to compare with GLDAS and NLDAS.' },
  { name: 'KNMI Climate Explorer', url: 'https://climexp.knmi.nl/', use: 'Linked', how: 'Every result page links to it under "Check it yourself", to test the trend against other datasets.' },
  { name: 'Statistical test methods to detect trends (Medium)', url: 'https://medium.com/@snp.kriss/statistical-test-methods-to-detect-trends-in-time-series-data-b361a0ec530b', use: 'Linked', how: 'Further reading on the Method page for the family of tests TrendLens uses (Mann-Kendall, Sen slope, t-test).' },
  { name: 'CSA: RADARSAT Constellation Mission data, SWOT, SAR tutorial', url: 'https://donnees-data.asc-csa.gc.ca/en/dataset/rcm', use: 'Linked', how: 'The Method page uses RCM (launched 2019) and SWOT (December 2022) to teach why a trend needs a long record, and links the SAR tutorial to start working with radar data.' },
  { name: 'Geo.ca and CSA ecosystem monitoring', url: 'https://geo.ca/', use: 'Linked', how: 'Linked from the Canadian Prairies region page and the Method page as Canadian data and context.' },
]
const INSTRUMENTS: [string, Use, string][] = [
  ['MERRA-2', 'Used', 'Air and hottest-day temperature, rainfall, humidity, wind, soil wetness, evaporation'],
  ['MODIS', 'Used', 'Tree cover and vegetation greenness; MODIS aerosols and clouds feed the CERES products'],
  ['GPM', 'Equivalent used', 'Rainfall comes from MERRA-2 (POWER PRECTOTCORR), a 1981+ record; GPM IMERG starts in 2000 and needs an Earthdata login'],
  ['GLDAS', 'Equivalent used', 'Soil wetness and evaporation come from MERRA-2'],
  ['OMI', 'Not used', 'Aerosol optical depth comes from CERES/MODIS instead'],
  ['AIRS', 'Not used', 'Upper-air variables are outside the current scope'],
]

export default function Sources({ cat }: { cat: Catalog }) {
  useTitle('Data & sources')
  return (
    <>
      <div className="page-head">
        <div className="wrap">
          <span className="eyebrow">Data & sources</span>
          <h1 style={{ marginTop: 12 }}>Where every number comes from</h1>
          <p className="lede">
            TrendLens uses public NASA and NOAA data only. Featured regions are downloaded once, cleaned and cached; Anywhere mode calls the same NASA
            service live. The cleaned regional series are published as CSV files in the project repository.
          </p>
        </div>
      </div>
      <section className="section">
        <div className="wrap">
          <div className="section-head">
            <h2>Datasets</h2>
          </div>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Dataset</th>
                  <th>Used for</th>
                  <th>Access</th>
                  <th>Coverage</th>
                </tr>
              </thead>
              <tbody>
                {DATASETS.filter((d) => !d.needs || Object.values(cat.results).some((r) => r[d.needs!])).map((d) => (
                  <tr key={d.name}>
                    <td style={{ minWidth: 180 }}>
                      <a href={d.url} target="_blank" rel="noreferrer">
                        <strong>{d.name}</strong>
                      </a>
                      <div className="tiny muted" style={{ marginTop: 4 }}>
                        {d.cite}
                      </div>
                    </td>
                    <td>{d.vars}</td>
                    <td>{d.via}</td>
                    <td className="small">{d.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small muted" style={{ marginTop: 14, maxWidth: '90ch' }}>
            These data were obtained from the NASA Langley Research Center (LaRC) POWER Project funded through the NASA Earth Science/Applied Science
            Program. MODIS subsets: ORNL DAAC (2018), MODIS and VIIRS Land Products Global Subsetting and Visualization Tool, ORNL DAAC, Oak Ridge,
            Tennessee, USA. doi:10.3334/ORNLDAAC/1379.
          </p>
        </div>
      </section>
      <section className="section">
        <div className="wrap">
          <div className="section-head">
            <div>
              <span className="eyebrow">From the challenge resources</span>
              <h2>Challenge resources we built on</h2>
            </div>
          </div>
          <div className="grid-2">
            {RESOURCES.map((r) => (
              <div key={r.name} style={{ borderTop: '2px solid var(--ink)', paddingTop: 14 }}>
                <h4>
                  <a href={r.url} target="_blank" rel="noreferrer">
                    {r.name}
                  </a>
                </h4>
                <p className="small" style={{ marginTop: 8, color: 'var(--ink-2)' }}>
                  {r.how}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="section">
        <div className="wrap grid-2" style={{ alignItems: 'start' }}>
          <div>
            <span className="eyebrow">Software</span>
            <h3 style={{ margin: '10px 0 12px' }}>Built with open tools</h3>
            <ul className="small" style={{ paddingLeft: 18, color: 'var(--ink-2)', display: 'grid', gap: 6 }}>
              <li>Data pipeline: Python with NumPy, SciPy and Requests; pymannkendall and SciPy as reference implementations in the tests.</li>
              <li>Web app: React, TypeScript and Vite; d3-scale and d3-shape for charts; Leaflet for maps.</li>
              <li>Statistics in the browser: our own TypeScript port of the pipeline, tested against the Python results.</li>
              <li>Type: Inter and DM Mono, the typefaces of nasa.gov.</li>
              <li>Place search in Anywhere mode: Open-Meteo geocoding.</li>
            </ul>
          </div>
          <div>
            <span className="eyebrow">Variables</span>
            <h3 style={{ margin: '10px 0 12px' }}>Plain-language definitions</h3>
            <dl className="kv">
              {Object.entries(cat.variables)
                .filter(([id]) => Object.values(cat.results).some((r) => r[id]))
                .map(([, v]) => (
                <div key={v.name} style={{ display: 'contents' }}>
                  <dt>{v.short}</dt>
                  <dd className="small">
                    {v.definition} <span className="muted">({v.unit})</span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>
      <section className="section" id="challenge-resources">
        <div className="wrap">
          <div className="section-head">
            <div>
              <span className="eyebrow">Be an Earth System Trend Detective</span>
              <h2>Challenge resources and how TrendLens uses them</h2>
            </div>
          </div>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Resource</th>
                  <th>In TrendLens</th>
                  <th>How</th>
                </tr>
              </thead>
              <tbody>
                {CHALLENGE.map((r) => (
                  <tr key={r.name}>
                    <td>
                      <a href={r.url} target="_blank" rel="noreferrer">
                        {r.name}
                      </a>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{r.use}</td>
                    <td>{r.how}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3 style={{ margin: '28px 0 10px' }}>Instruments and models named in the challenge</h3>
          <div className="table-scroll">
            <table className="table">
              <tbody>
                {INSTRUMENTS.map(([n, u, how]) => (
                  <tr key={n}>
                    <td style={{ fontWeight: 600 }}>{n}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{u}</td>
                    <td>{how}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
      <section className="section" id="impact-sources">
        <div className="wrap">
          <div className="section-head">
            <div>
              <span className="eyebrow">Impact panels and case files</span>
              <h2>Why it matters: research sources</h2>
            </div>
          </div>
          <p className="small" style={{ color: 'var(--ink-2)', maxWidth: '90ch', marginBottom: 16 }}>
            The "why this matters" text on every result is context from these publications, not a conclusion of our statistics. Each one was read
            before it was cited.
          </p>
          <div className="grid-2">
            {sourcesByOrg()
              .filter((g) => g.items.length)
              .map((g) => (
                <div key={g.org}>
                  <h4 style={{ marginBottom: 8 }}>{g.label}</h4>
                  <ul className="small" style={{ paddingLeft: 18, color: 'var(--ink-2)', display: 'grid', gap: 6, margin: 0 }}>
                    {g.items.map((it) => (
                      <li key={it.id}>
                        {it.cite}{' '}
                        <a href={it.url} target="_blank" rel="noreferrer">
                          {it.doi ? `doi:${it.doi}` : 'link'}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </div>
        </div>
      </section>
      <section className="section">
        <div className="wrap">
          <div className="section-head">
            <h2>References</h2>
          </div>
          <ol className="small" style={{ paddingLeft: 20, color: 'var(--ink-2)', display: 'grid', gap: 8, maxWidth: '100ch' }}>
            {REFS.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ol>
        </div>
      </section>
    </>
  )
}
