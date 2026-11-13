import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { Demo } from '../lib/demos'

interface DemoState {
  demos: Demo[] | null
  start: (id: string) => void
}

const Ctx = createContext<DemoState>({ demos: null, start: () => {} })
export const useDemos = () => useContext(Ctx)

const STEP_MS = 9000

export function DemoProvider({ demos, children }: { demos: Demo[] | null; children: React.ReactNode }) {
  const [active, setActive] = useState<{ demo: Demo; step: number } | null>(null)
  const start = useCallback(
    (id: string) => {
      const d = demos?.find((x) => x.id === id)
      if (d) setActive({ demo: d, step: 0 })
    },
    [demos],
  )
  return (
    <Ctx.Provider value={{ demos, start }}>
      {children}
      {active && <DemoBar demo={active.demo} step={active.step} setStep={(s) => setActive(s === null ? null : { demo: active.demo, step: s })} />}
    </Ctx.Provider>
  )
}

function DemoBar({ demo, step, setStep }: { demo: Demo; step: number; setStep: (s: number | null) => void }) {
  const [paused, setPaused] = useState(false)
  const [progress, setProgress] = useState(0)
  const s = demo.steps[step]
  const last = step === demo.steps.length - 1
  const done = useRef(0) // fraction of the current step already shown
  const next = useRef(setStep)
  next.current = setStep

  // go to the step's screen and highlight the element it talks about
  useEffect(() => {
    done.current = 0
    setProgress(0)
    if (window.location.hash !== s.to) window.location.hash = s.to
    let tries = 0
    const find = window.setInterval(() => {
      const el = s.highlight ? document.querySelector(s.highlight) : null
      if (el || ++tries > 40) {
        window.clearInterval(find)
        if (el) {
          el.classList.add('demo-highlight')
          // keep the element's top just under the sticky header, clear of the caption bar
          window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 84, behavior: 'smooth' })
        }
      }
    }, 100)
    return () => {
      window.clearInterval(find)
      document.querySelectorAll('.demo-highlight').forEach((n) => n.classList.remove('demo-highlight'))
    }
  }, [s])

  // auto-advance; pausing keeps the progress made so far
  useEffect(() => {
    if (paused) return
    const ms = s.ms ?? STEP_MS
    const start = performance.now() - done.current * ms
    const id = window.setInterval(() => {
      const p = Math.min(1, (performance.now() - start) / ms)
      done.current = p
      setProgress(p)
      if (p >= 1) {
        window.clearInterval(id)
        if (!last) next.current(step + 1)
      }
    }, 50)
    return () => window.clearInterval(id)
  }, [paused, step, s, last])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setStep(null)
      if (e.key === 'ArrowRight' && !last) setStep(step + 1)
      if (e.key === 'ArrowLeft' && step > 0) setStep(step - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step, last, setStep])

  return (
    <div className="demo-bar" role="dialog" aria-live="polite" aria-label={demo.title}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <span className="eyebrow">
          {demo.kicker} · step {step + 1} of {demo.steps.length}
        </span>
        <button className="btn small ghost on-dark" onClick={() => setStep(null)} aria-label="Close demo" style={{ padding: '2px 8px' }}>
          Close
        </button>
      </div>
      <p>{s.text}</p>
      <div className="progress" aria-hidden="true">
        <span style={{ width: `${progress * 100}%` }} />
      </div>
      <div className="controls">
        <button className="btn small ghost on-dark" disabled={step === 0} onClick={() => setStep(step - 1)}>
          Back
        </button>
        <button className="btn small ghost on-dark" onClick={() => setPaused((p) => !p)}>
          {paused ? 'Play' : 'Pause'}
        </button>
        {last ? (
          <button className="btn small light" onClick={() => setStep(null)}>
            Explore on your own
          </button>
        ) : (
          <button className="btn small light" onClick={() => setStep(step + 1)}>
            Next
          </button>
        )}
      </div>
    </div>
  )
}
