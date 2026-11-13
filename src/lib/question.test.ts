import { describe, expect, it } from 'vitest'
import { matchQuestion } from './question'

describe('question matcher', () => {
  it('finds variable and featured region', () => {
    const m = matchQuestion('Is rainfall getting weaker in the Amazon?')
    expect(m.variables[0]).toBe('precip')
    expect(m.region).toBe('samazon')
  })
  it('sends places outside the featured boxes to the geocoder', () => {
    const m = matchQuestion('Is it getting hazier over Delhi?')
    expect(m.variables).toContain('aod')
    expect(m.region).toBeUndefined()
    expect(m.placeText).toBe('Delhi')
  })
  it('understands heat and sunlight words', () => {
    expect(matchQuestion('Is Phoenix getting hotter?').variables).toContain('t2m')
    expect(matchQuestion('Is Phoenix getting hotter?').region).toBe('swus')
    expect(matchQuestion('Is solar dimming happening in Bihar?').variables).toContain('sun')
  })
  it('falls back from greenness to tree cover', () => {
    expect(matchQuestion('Is the Sahel getting greener?').variables).toEqual(['ndvi', 'tree'])
  })
})
