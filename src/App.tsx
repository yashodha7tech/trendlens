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
import Sources from './pages/Sources'
import Trend from './pages/Trend'

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
      case 'method':
        page = <Method cat={c} />
        break
      case 'sources':
        page = <Sources cat={c} />
        break
      default:
        page = <ErrorBox message="This page does not exist." />
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
