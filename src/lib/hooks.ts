import { useEffect, useRef, useState } from 'react'

/** Width of an element, tracked with ResizeObserver. */
export function useWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)))
    ro.observe(ref.current)
    setW(Math.round(ref.current.getBoundingClientRect().width))
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

export interface Async<T> {
  data?: T
  error?: string
  loading: boolean
}

/** Run an async loader whenever deps change; keeps the previous data while reloading. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): Async<T> {
  const [state, setState] = useState<Async<T>>({ loading: true })
  useEffect(() => {
    let live = true
    setState((s) => ({ data: s.data, loading: true }))
    fn().then(
      (data) => live && setState({ data, loading: false }),
      (e: unknown) => live && setState({ loading: false, error: e instanceof Error ? e.message : String(e) }),
    )
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return state
}

export function useTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · TrendLens` : 'TrendLens · Earth System Trend Detective'
  }, [title])
}
