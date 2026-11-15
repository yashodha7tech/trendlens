import { useEffect, useState } from 'react'
import { useRoute } from '../lib/router'

export function Mark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="14" cy="14" r="10.5" fill="none" stroke="#fff" strokeWidth="2.2" />
      <path d="M21.6 21.6 L29 29" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
      <path d="M7.5 17.5 L11 14.5 L13.6 16.2 L18.5 10.5" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="18.6" cy="10.4" r="2.1" fill="#e4322b" />
    </svg>
  )
}

const LINKS: [string, string][] = [
  ['explore', 'Explore'],
  ['compare', 'Compare'],
  ['anywhere', 'Anywhere'],
  ['region', 'Your region'],
  ['method', 'Method'],
  ['sources', 'Data & sources'],
]

export function Header() {
  const route = useRoute()
  const [open, setOpen] = useState(false)
  useEffect(() => setOpen(false), [route])
  const section = route.path[0] === 'trend' ? (route.path[1] === 'point' ? 'anywhere' : 'explore') : route.path[0]
  return (
    <header className="site-header">
      <div className="wrap">
        <a className="wordmark" href="#/" aria-label="TrendLens home">
          <Mark />
          <strong>TrendLens</strong>
          <span>by Cosmosis</span>
        </a>
        <button className="nav-toggle" aria-expanded={open} aria-controls="site-nav" onClick={() => setOpen((o) => !o)}>
          Menu
        </button>
        <nav id="site-nav" className={open ? 'nav open' : 'nav'} aria-label="Main">
          {LINKS.map(([id, label]) => (
            <a key={id} href={`#/${id}`} aria-current={section === id ? 'page' : undefined}>
              {label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  )
}

export function Footer({ generated }: { generated?: string }) {
  return (
    <footer className="site-footer">
      <div className="wrap">
        <div>
          <h4>TrendLens</h4>
          <p>
            Built by Team Cosmosis for the 2026 NASA Space Apps Challenge, <em>Be an Earth System Trend Detective</em>. TrendLens helps students and
            the public find what is changing on Earth, where, by how much, and whether the change is statistically significant.
          </p>
          <p style={{ marginTop: 12 }} className="tiny">
            NASA does not endorse this project. Results are trend statistics, not forecasts, and they do not prove causes.
          </p>
        </div>
        <div>
          <h4>Data</h4>
          <ul>
            <li>
              <a href="https://power.larc.nasa.gov/" target="_blank" rel="noreferrer">
                NASA POWER
              </a>{' '}
              (MERRA-2, CERES SYN1deg)
            </li>
            <li>
              <a href="https://modis.ornl.gov/data/modis_webservice.html" target="_blank" rel="noreferrer">
                MODIS via ORNL DAAC
              </a>{' '}
              (MODIS Terra)
            </li>
            <li>
              <a href="https://www.ncei.noaa.gov/cdo-web/" target="_blank" rel="noreferrer">
                NOAA Climate Data Online
              </a>{' '}
              (GSOM stations)
            </li>
            <li>
              <a href="https://earthdata.nasa.gov/gibs" target="_blank" rel="noreferrer">
                NASA GIBS
              </a>{' '}
              imagery
            </li>
          </ul>
        </div>
        <div>
          <h4>Learn more</h4>
          <ul>
            <li>
              <a href="#/method">How the statistics work</a>
            </li>
            <li>
              <a href="#/sources">Datasets, citations and resources</a>
            </li>
            <li>
              <a href="https://www.spaceappschallenge.org/2026/challenges/earth-system-trend-detective/" target="_blank" rel="noreferrer">
                The challenge
              </a>
            </li>
          </ul>
          {generated && <p className="tiny" style={{ marginTop: 14 }}>Data cache built {generated}.</p>}
        </div>
      </div>
    </footer>
  )
}
