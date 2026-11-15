import { useEffect, useState } from 'react'
import { ErrorBox, Loading } from './components/bits'
import { DemoProvider } from './components/DemoPlayer'
import { Footer, Header } from './components/Layout'
import { loadCatalog } from './lib/data'
import { buildDemos, type Demo } from './lib/demos'
import { useAsync } from './lib/hooks'
import { useRoute } from './lib/router'
import Anywhere from './pages/Anywhere'
import Compare from './pages/Compare'
import Explore from './pages/Explore'
import Home from './pages/Home'
import Method from './pages/Method'
import Region from './pages/Region'
import Sources from './pages/Sources'
import Trend from './pages/Trend'

function NotFound() {
  return (
    <div className="page-head" style={{ borderBottom: 0, paddingBottom: 80 }}>
      <div className="wrap">
        <span className="eyebrow">404</span>
        <h1 style={{ marginTop: 12 }}>No trend here</h1>
        <p className="lede">This page does not exist. Start a new investigation instead.</p>
        <div style={{ display: 'flex', gap: 10, marginTop: 22, flexWrap: 'wrap' }}>
          <a className="btn arrow" href="#/">
            Home
          </a>
          <a className="btn ghost" href="#/explore">
            Explore regions
          </a>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const route = useRoute()
  const cat = useAsync(loadCatalog, [])
  const [demos, setDemos] = useState<Demo[] | null>(null)

  useEffect(() => {
    if (cat.data) buildDemos(cat.data).then(setDemos, () => setDemos([]))
  }, [cat.data])

  useEffect(() => {
    if (!route.query.get('keep')) window.scrollTo({ top: 0 })
  }, [route.path.join('/')])

  let page: React.ReactNode
  if (cat.error) page = <ErrorBox message={cat.error} />
  else if (!cat.data) page = <Loading />
  else {
    const c = cat.data
    const [p0, p1, p2, p3] = route.path
    switch (p0) {
      case undefined:
        page = <Home cat={c} />
        break
      case 'explore':
        page = <Explore cat={c} region={p1} topic={route.query.get('topic') ?? undefined} variable={route.query.get('v') ?? undefined} />
        break
      case 'trend':
        page = <Trend cat={c} region={p1} variable={p2} query={route.query} />
        break
      case 'compare':
        page = <Compare cat={c} variable={p1} a={p2} b={p3} />
        break
      case 'anywhere':
        page = <Anywhere cat={c} query={route.query} />
        break
      case 'region':
        page = <Region cat={c} query={route.query} />
        break
      case 'method':
        page = <Method cat={c} />
        break
      case 'sources':
        page = <Sources cat={c} />
        break
      default:
        page = <NotFound />
    }
  }

  return (
    <DemoProvider demos={demos}>
      <Header />
      <main id="main">{page}</main>
      <Footer generated={cat.data?.generated} />
    </DemoProvider>
  )
}
