import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { analyze, bhFdr, erfc, mannKendall, olsTrend, senSlope, studentP2 } from './stats'
import fixtures from './__fixtures__/stats_cases.json'

const close = (a: number, b: number, rel = 1e-9, abs = 1e-12) =>
  expect(Math.abs(a - b) <= Math.max(abs, rel * Math.abs(b)), `${a} vs ${b}`).toBe(true)

describe('special functions', () => {
  it('erfc matches known values', () => {
    close(erfc(0), 1)
    close(erfc(0.5), 0.4795001221869535)
    close(erfc(1.959963984540054 / Math.SQRT2), 0.05, 1e-12)
    close(erfc(3.5), 7.430983723414128e-7, 1e-12)
    close(erfc(6), 2.151973671249892e-17, 1e-10)
  })
  it('Student t two-sided p matches scipy', () => {
    close(studentP2(2.0, 10), 0.07338803477074037, 1e-10)
    close(studentP2(1.5, 23.7), 0.14681923105269623, 1e-10)
    close(studentP2(4.2, 38), 0.00015531325124916941, 1e-10)
  })
})

describe('matches pipeline/stats.py on synthetic cases', () => {
  for (const [k, c] of fixtures.cases.entries()) {
    it(`case ${k} (n=${c.x.length})`, () => {
      const mk = mannKendall(c.x, c.t)
      expect(mk.s).toBe(c.mk.s)
      close(mk.varS, c.mk.var_s)
      close(mk.factor, c.mk.factor, 1e-9)
      close(mk.p, c.mk.p, 1e-7, 1e-12)
      const mk0 = mannKendall(c.x, c.t, 'none')
      close(mk0.p, c.mk_none.p, 1e-7, 1e-12)
      const sen = senSlope(c.x, c.t, mk.varCorrected)
      close(sen.slope, c.sen.slope)
      close(sen.intercept, c.sen.intercept, 1e-9, 1e-9)
      close(sen.low, c.sen.low)
      close(sen.high, c.sen.high)
      if (c.ols) {
        const ols = olsTrend(c.x, c.t)
        close(ols.slope, c.ols.slope, 1e-9)
        close(ols.p, c.ols.p, 1e-6, 1e-10)
        close(ols.low, c.ols.low, 1e-6)
      }
    })
  }
  for (const [k, m] of fixtures.monthly.entries()) {
    it(`monthly series ${k}`, () => {
      const res = analyze(m.years, m.values, 12, m.months)
      close(res.sen.slope, m.slope)
      close(res.sen.low, m.low)
      close(res.sen.high, m.high)
      close(res.mk.p, m.p, 1e-7, 1e-12)
      close(res.ols.p, m.t_p, 1e-6, 1e-10)
      close(res.yearsNeeded!, m.years_needed!, 1e-9)
      close(res.snr, m.snr, 1e-9)
    })
  }
  it('Benjamini-Hochberg', () => {
    const { sig, adj } = bhFdr(fixtures.bh.p)
    adj.forEach((a, i) => close(a, fixtures.bh.adj[i], 1e-12))
    expect(sig).toEqual(fixtures.bh.sig)
  })
})

// Every published result must be reproducible in the browser from the published series.
const dataDir = join(__dirname, '../../public/data')
const catalog = JSON.parse(readFileSync(join(dataDir, 'catalog.json'), 'utf8'))
describe('reproduces every published regional result', () => {
  for (const file of readdirSync(join(dataDir, 'regions'))) {
    const region = JSON.parse(readFileSync(join(dataDir, 'regions', file), 'utf8'))
    for (const [vid, s] of Object.entries<any>(region.series)) {
      it(`${region.id} / ${vid}`, () => {
        const ref = catalog.results[region.id][vid]
        const dec = catalog.variables[vid].decimals
        const n = s.values.length
        const years = s.per_year === 12 ? s.values.map((_: number, i: number) => s.start + Math.floor(i / 12)) : s.values.map((_: number, i: number) => s.start + i)
        const months = s.per_year === 12 ? s.values.map((_: number, i: number) => (i % 12) + 1) : undefined
        expect(n).toBeGreaterThan(0)
        const res = analyze(years, s.values, s.per_year, months)
        const tol = 0.51 * 10 ** -(dec + 2)
        expect(Math.abs(res.sen.slope * 10 - ref.slope)).toBeLessThanOrEqual(tol)
        expect(Math.abs(res.sen.low * 10 - ref.low)).toBeLessThanOrEqual(tol)
        expect(Math.abs(res.sen.high * 10 - ref.high)).toBeLessThanOrEqual(tol)
        expect(Math.abs(res.mk.p - ref.p)).toBeLessThanOrEqual(6e-7)
        expect(Math.abs(res.ols.p - ref.t_p)).toBeLessThanOrEqual(2e-6)
        expect(res.verdict).toBe(ref.verdict)
      })
    }
  }
})
