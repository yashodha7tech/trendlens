/**
 * Trend statistics, a line-for-line port of pipeline/stats.py.
 * src/lib/stats.test.ts checks this file against the Python results for every
 * region and variable, and pipeline/test_stats.py checks the Python against
 * pymannkendall and scipy.
 */

export const ALPHA = 0.05
export const Z975 = 1.959963984540054 // standard normal 97.5% quantile

// ------------------------------------------------------------------ special functions

const SQRT_PI = Math.sqrt(Math.PI)

/** Complementary error function, accurate to ~1e-15 relative. */
export function erfc(x: number): number {
  if (x < 0) return 2 - erfc(-x)
  if (x < 3) {
    // erf(x) = 2/sqrt(pi) * exp(-x^2) * sum 2^n x^(2n+1) / (1*3*...*(2n+1))
    let term = x
    let sum = x
    for (let n = 1; n < 200; n++) {
      term *= (2 * x * x) / (2 * n + 1)
      sum += term
      if (term < 1e-17 * sum) break
    }
    return 1 - (2 / SQRT_PI) * Math.exp(-x * x) * sum
  }
  // continued fraction (modified Lentz) for x >= 3
  const tiny = 1e-300
  let f = x
  let C = x
  let D = 0
  for (let n = 1; n < 300; n++) {
    const a = n / 2
    D = x + a * D
    D = Math.abs(D) < tiny ? tiny : D
    C = x + a / C
    C = Math.abs(C) < tiny ? tiny : C
    D = 1 / D
    const delta = C * D
    f *= delta
    if (Math.abs(delta - 1) < 1e-16) break
  }
  return Math.exp(-x * x) / SQRT_PI / f
}

export const normCdf = (z: number) => 0.5 * erfc(-z / Math.SQRT2)
/** Two-sided p-value of a standard normal statistic. */
export const normP2 = (z: number) => erfc(Math.abs(z) / Math.SQRT2)

function logGamma(x: number): number {
  const g = 7
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ]
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x)
  x -= 1
  let a = c[0]
  const t = x + g + 0.5
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i)
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a)
}

function betacf(a: number, b: number, x: number): number {
  const tiny = 1e-300
  let c = 1
  let d = 1 - ((a + b) * x) / (a + 1)
  if (Math.abs(d) < tiny) d = tiny
  d = 1 / d
  let h = d
  for (let m = 1; m <= 500; m++) {
    const m2 = 2 * m
    let aa = (m * (b - m) * x) / ((a - 1 + m2) * (a + m2))
    d = 1 + aa * d
    if (Math.abs(d) < tiny) d = tiny
    c = 1 + aa / c
    if (Math.abs(c) < tiny) c = tiny
    d = 1 / d
    h *= d * c
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + 1 + m2))
    d = 1 + aa * d
    if (Math.abs(d) < tiny) d = tiny
    c = 1 + aa / c
    if (Math.abs(c) < tiny) c = tiny
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < 1e-16) break
  }
  return h
}

/** Regularized incomplete beta I_x(a, b). */
function ibeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x))
  if (x < (a + 1) / (a + b + 2)) return (bt * betacf(a, b, x)) / a
  return 1 - (bt * betacf(b, a, 1 - x)) / b
}

/** Two-sided p-value of Student's t with (possibly fractional) df. */
export function studentP2(t: number, df: number): number {
  return ibeta(df / (df + t * t), df / 2, 0.5)
}

/** Student t quantile for probability q > 0.5, by bisection on the CDF. */
export function studentQuantile(q: number, df: number): number {
  const target = 2 * (1 - q) // two-sided tail mass
  let lo = 0
  let hi = 1000
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    if (studentP2(mid, df) > target) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

// ------------------------------------------------------------------ helpers

const isNum = (v: number | null | undefined): v is number => v !== null && v !== undefined && Number.isFinite(v)

function median(sorted: number[]): number {
  const n = sorted.length
  const h = Math.floor(n / 2)
  return n % 2 ? sorted[h] : (sorted[h - 1] + sorted[h]) / 2
}

function mean(a: number[]): number {
  let s = 0
  for (const v of a) s += v
  return s / a.length
}

function std1(a: number[]): number {
  const m = mean(a)
  let s = 0
  for (const v of a) s += (v - m) * (v - m)
  return Math.sqrt(s / (a.length - 1))
}

/** Python's round(): halves go to the even neighbour. */
function roundHalfEven(x: number): number {
  const r = Math.round(x)
  return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r
}

export function acf(x: number[], nlags: number): number[] {
  const n = x.length
  const m = mean(x)
  const y = x.map((v) => v - m)
  const out: number[] = []
  let c0 = 0
  for (let i = 0; i < n; i++) c0 += y[i] * y[i]
  c0 /= n
  if (c0 <= 0) return [1, ...new Array(nlags).fill(0)]
  for (let k = 0; k <= nlags; k++) {
    let s = 0
    for (let i = 0; i + k < n; i++) s += y[i] * y[i + k]
    out.push(s / n / c0)
  }
  return out
}

/** Lag-1 autocorrelation with the Marriott & Pope (1954) small-sample bias correction. */
export function lag1(resid: number[], biasCorrect = true): number {
  const n = resid.length
  let r = acf(resid, 1)[1]
  if (biasCorrect && n > 5) r = (n * r + 1) / (n - 4)
  return r
}

// ------------------------------------------------------------------ preparation

export function deseasonalize(values: (number | null)[], months: number[]): number[] {
  const finite = values.filter(isNum) as number[]
  const overall = mean(finite)
  const out = new Array<number>(values.length).fill(NaN)
  for (let m = 1; m <= 12; m++) {
    const sel: number[] = []
    for (let i = 0; i < values.length; i++) if (months[i] === m) sel.push(i)
    const vals = sel.map((i) => values[i]).filter(isNum) as number[]
    if (!vals.length) continue
    const mm = mean(vals)
    for (const i of sel) out[i] = isNum(values[i]) ? (values[i] as number) - mm + overall : NaN
  }
  return out
}

export function annualMeans(values: number[], years: number[], minMonths = 9): { years: number[]; means: number[] } {
  const ys = [...new Set(years)].sort((a, b) => a - b)
  const means = ys.map((y) => {
    const v = values.filter((_, i) => years[i] === y && Number.isFinite(values[i]))
    return v.length >= minMonths ? mean(v) : NaN
  })
  return { years: ys, means }
}

// ------------------------------------------------------------------ Mann-Kendall

function sAndVar(x: number[]): { s: number; varS: number } {
  const n = x.length
  let s = 0
  for (let i = 0; i < n - 1; i++) for (let j = i + 1; j < n; j++) s += Math.sign(x[j] - x[i])
  const counts = new Map<number, number>()
  for (const v of x) counts.set(v, (counts.get(v) ?? 0) + 1)
  let tieTerm = 0
  for (const c of counts.values()) if (c > 1) tieTerm += c * (c - 1) * (2 * c + 5)
  return { s, varS: (n * (n - 1) * (2 * n + 5) - tieTerm) / 18 }
}

function zScore(s: number, v: number): number {
  if (s > 0) return (s - 1) / Math.sqrt(v)
  if (s < 0) return (s + 1) / Math.sqrt(v)
  return 0
}

export interface MKResult {
  n: number
  s: number
  varS: number
  varCorrected: number
  factor: number
  r1: number
  tau: number
  z: number
  p: number
}

/** Mann-Kendall test with the AR(1) effective-sample-size correction ("ar1" in stats.py). */
export function mannKendall(x: number[], t: number[], method: 'ar1' | 'none' = 'ar1'): MKResult {
  const keep = x.map((v, i) => [v, t[i]] as const).filter(([v]) => Number.isFinite(v))
  const xs = keep.map((k) => k[0])
  const ts = keep.map((k) => k[1])
  const n = xs.length
  const { s, varS } = sAndVar(xs)
  const tau = s / (0.5 * n * (n - 1))
  let factor = 1
  let r1 = 0
  if (method === 'ar1' && n >= 6) {
    const slope = senSlope(xs, ts).slope
    const detrended = xs.map((v, i) => v - (ts[i] - ts[0] + 1) * slope)
    r1 = Math.min(Math.max(lag1(detrended), 0), 0.95)
    let sum = 0
    for (let k = 1; k < n; k++) sum += (1 - k / n) * r1 ** k
    factor = 1 + 2 * sum
  }
  const varCorrected = varS * factor
  const z = varCorrected > 0 ? zScore(s, varCorrected) : 0
  return { n, s, varS, varCorrected, factor, r1, tau, z, p: normP2(z) }
}

// ------------------------------------------------------------------ Theil-Sen

export interface SenResult {
  slope: number
  intercept: number
  low: number
  high: number
}

export function senSlope(x: number[], t: number[], varS?: number): SenResult {
  const keep = x.map((v, i) => [v, t[i]] as const).filter(([v]) => Number.isFinite(v))
  const xs = keep.map((k) => k[0])
  const ts = keep.map((k) => k[1])
  const n = xs.length
  const slopes: number[] = []
  for (let i = 0; i < n - 1; i++)
    for (let j = i + 1; j < n; j++) {
      const dt = ts[j] - ts[i]
      if (dt !== 0) slopes.push((xs[j] - xs[i]) / dt)
    }
  slopes.sort((a, b) => a - b)
  const slope = median(slopes)
  const intercept = median([...xs].sort((a, b) => a - b)) - slope * median([...ts].sort((a, b) => a - b))
  const v = varS ?? sAndVar(xs).varS
  const nt = slopes.length
  const sigma = Math.sqrt(v)
  const ru = Math.min(roundHalfEven((nt + Z975 * sigma) / 2), nt - 1)
  const rl = Math.max(roundHalfEven((nt - Z975 * sigma) / 2) - 1, 0)
  return { slope, intercept, low: slopes[rl], high: slopes[ru] }
}

// ------------------------------------------------------------------ t-test

export interface OLSResult {
  slope: number
  intercept: number
  se: number
  t: number
  df: number
  p: number
  low: number
  high: number
  r1: number
  nEff: number
}

export function olsTrend(x: number[], t: number[]): OLSResult {
  const keep = x.map((v, i) => [v, t[i]] as const).filter(([v]) => Number.isFinite(v))
  const xs = keep.map((k) => k[0])
  const ts = keep.map((k) => k[1])
  const n = xs.length
  const tm = mean(ts)
  const xm = mean(xs)
  let sxx = 0
  let sxy = 0
  for (let i = 0; i < n; i++) {
    sxx += (ts[i] - tm) ** 2
    sxy += (ts[i] - tm) * (xs[i] - xm)
  }
  const b = sxy / sxx
  const a = xm - b * tm
  const resid = xs.map((v, i) => v - (a + b * ts[i]))
  const r1 = n > 5 ? Math.min(lag1(resid), 0.95) : 0
  let nEff = r1 > 0 ? (n * (1 - r1)) / (1 + r1) : n
  nEff = Math.max(nEff, 3)
  let rss = 0
  for (const r of resid) rss += r * r
  const se = Math.sqrt(rss / (nEff - 2) / sxx)
  const tstat = se > 0 ? b / se : 0
  const df = nEff - 2
  const tc = studentQuantile(1 - ALPHA / 2, df)
  return { slope: b, intercept: a, se, t: tstat, df, p: studentP2(Math.abs(tstat), df), low: b - tc * se, high: b + tc * se, r1, nEff }
}

// ------------------------------------------------------------------ maps

export function bhFdr(p: number[], q = ALPHA): { sig: boolean[]; adj: number[] } {
  const ok = p.map((v, i) => [v, i] as const).filter(([v]) => Number.isFinite(v))
  const m = ok.length
  const sig = new Array<boolean>(p.length).fill(false)
  const adj = new Array<number>(p.length).fill(NaN)
  if (!m) return { sig, adj }
  ok.sort((a, b) => a[0] - b[0])
  const ranked = ok.map(([v], k) => (v * m) / (k + 1))
  for (let k = m - 2; k >= 0; k--) ranked[k] = Math.min(ranked[k], ranked[k + 1])
  ok.forEach(([, i], k) => {
    adj[i] = Math.min(ranked[k], 1)
    sig[i] = adj[i] <= q
  })
  return { sig, adj }
}

// ------------------------------------------------------------------ detection time

/** Weatherhead et al. (1998): years of data needed to detect a trend of this size. */
export function yearsNeeded(resid: number[], slopePerYear: number, perYear: number): number | null {
  const r = resid.filter((v) => Number.isFinite(v))
  if (r.length < 10 || slopePerYear === 0) return null
  const sigma = std1(r)
  const phi = Math.min(Math.max(acf(r, 1)[1], -0.95), 0.95)
  return ((3.3 * sigma * Math.sqrt(12 / perYear)) / Math.abs(slopePerYear) * Math.sqrt((1 + phi) / (1 - phi))) ** (2 / 3)
}

// ------------------------------------------------------------------ full analysis

export type Verdict = 'significant' | 'not_yet' | 'none'

export interface Analysis {
  nYears: number
  first: number
  last: number
  mk: MKResult
  sen: SenResult
  ols: OLSResult
  yearsNeeded: number | null
  noise: number
  snr: number
  verdict: Verdict
  annualYears: number[]
  annual: number[]
  deseasonalized: number[]
}

/**
 * values: monthly (perYear 12, with months 1-12) or yearly (perYear 1) values.
 * Annual points sit at mid-year (year + 0.5); slopes are per year.
 */
export function analyze(years: number[], values: (number | null)[], perYear: 12 | 1, months?: number[]): Analysis {
  let des: number[]
  let ys: number[]
  let ann: number[]
  if (perYear === 12) {
    des = deseasonalize(values, months!)
    const a = annualMeans(des, years)
    ys = a.years
    ann = a.means
  } else {
    des = values.map((v) => (isNum(v) ? v : NaN))
    ys = years.slice()
    ann = des.slice()
  }
  const t = ys.map((y) => y + 0.5)
  const okIdx = ann.map((v, i) => (Number.isFinite(v) ? i : -1)).filter((i) => i >= 0)
  const annOk = okIdx.map((i) => ann[i])
  const tOk = okIdx.map((i) => t[i])
  const mk = mannKendall(annOk, tOk)
  const sen = senSlope(annOk, tOk, mk.varCorrected)
  const ols = olsTrend(annOk, tOk)
  const tmonth = years.map((y, i) => (perYear === 12 ? y + (months![i] - 0.5) / 12 : y + 0.5))
  const resid = des.map((v, i) => v - (sen.intercept + sen.slope * tmonth[i]))
  const detrended = annOk.map((v, i) => v - (sen.intercept + sen.slope * tOk[i]))
  const noise = std1(detrended)
  const span = tOk[tOk.length - 1] - tOk[0]
  const need = yearsNeeded(resid, sen.slope, perYear)
  const nYears = okIdx.length
  const verdict: Verdict = mk.p < ALPHA ? 'significant' : need !== null && need <= 2 * nYears ? 'not_yet' : 'none'
  return {
    nYears,
    first: ys[okIdx[0]],
    last: ys[okIdx[okIdx.length - 1]],
    mk,
    sen,
    ols,
    yearsNeeded: need,
    noise,
    snr: noise > 0 ? (Math.abs(sen.slope) * span) / noise : 0,
    verdict,
    annualYears: ys,
    annual: ann,
    deseasonalized: des,
  }
}

export interface SensitivityCell {
  start: number
  slope: number
  p: number
  significant: boolean
}

/** Repeat the annual test for every start year that leaves at least minYears of record. */
export function sensitivity(annualYears: number[], annual: number[], minYears = 10): SensitivityCell[] {
  const out: SensitivityCell[] = []
  const last = annualYears[annualYears.length - 1]
  for (const start of annualYears) {
    if (last - start + 1 < minYears) break
    const idx = annualYears.map((y, i) => (y >= start && Number.isFinite(annual[i]) ? i : -1)).filter((i) => i >= 0)
    const x = idx.map((i) => annual[i])
    const t = idx.map((i) => annualYears[i] + 0.5)
    if (x.length < minYears) continue
    const mk = mannKendall(x, t)
    const sen = senSlope(x, t, mk.varCorrected)
    out.push({ start, slope: sen.slope, p: mk.p, significant: mk.p < ALPHA })
  }
  return out
}
