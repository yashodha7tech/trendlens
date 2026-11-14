import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Catalog } from '../lib/types'
import { featuredRegions, parseLatLon } from './GlobeLoader'

describe('parseLatLon', () => {
  it('reads decimal pairs with commas, semicolons or spaces', () => {
    expect(parseLatLon('12.97, 77.59')).toEqual([12.97, 77.59])
    expect(parseLatLon('12.97,77.59')).toEqual([12.97, 77.59])
    expect(parseLatLon(' -34 ; 143 ')).toEqual([-34, 143])
    expect(parseLatLon('62.03 129.73')).toEqual([62.03, 129.73])
  })
  it('reads hemisphere letters and degree signs', () => {
    expect(parseLatLon('33.45°S, 70.66°W')).toEqual([-33.45, -70.66])
    expect(parseLatLon('12.97N 77.59E')).toEqual([12.97, 77.59])
    expect(parseLatLon('40.4 n, 3.7 w')).toEqual([40.4, -3.7])
  })
  it('rejects place names and points off the globe', () => {
    expect(parseLatLon('Bengaluru')).toBeNull()
    expect(parseLatLon('1999')).toBeNull()
    expect(parseLatLon('Route 66 West')).toBeNull()
    expect(parseLatLon('95, 10')).toBeNull()
    expect(parseLatLon('10, 190')).toBeNull()
  })
})

describe('featuredRegions', () => {
  const cat = JSON.parse(readFileSync(resolve(__dirname, '../../public/data/catalog.json'), 'utf8')) as Catalog
  const regions = featuredRegions(cat)

  it('has one entry per catalog region with its box and Explore link', () => {
    expect(regions.map((r) => r.id)).toEqual(Object.keys(cat.regions))
    for (const r of regions) {
      expect(r.bbox).toEqual(cat.regions[r.id].bbox)
      expect(r.href).toBe(`#/explore/${r.id}`)
    }
  })

  it('headlines the significant trend with the highest signal-to-noise ratio, coloured by its direction', () => {
    for (const r of regions) {
      const sig = Object.entries(cat.results[r.id] ?? {}).filter(([, s]) => s.verdict === 'significant')
      if (!sig.length) {
        expect(r.dir).toBe('flat')
        expect(r.variable).toBe('')
        continue
      }
      const [vid, s] = sig.reduce((a, b) => (b[1].snr > a[1].snr ? b : a))
      expect(r.variable).toBe(cat.variables[vid].name)
      expect(r.dir).toBe(s.slope > 0 ? 'rise' : s.slope < 0 ? 'fall' : 'flat')
      expect(r.trend).toMatch(/per decade$/)
      expect(r.detail).toContain(`${s.first}–${s.last}`)
    }
  })
})
