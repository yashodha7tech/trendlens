import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LIVE_VARIABLES, pointUrl } from './data'
import { QUESTION_TOPICS, QUESTION_VARIABLES, matchQuestion } from './question'
import type { Catalog } from './types'

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

describe('question matcher: hottest days, humidity, clouds and wind', () => {
  it('opens hottest-day temperature for heatwave questions', () => {
    const m = matchQuestion('Are heatwaves getting worse in Phoenix?')
    expect(m.variables[0]).toBe('tmax')
    expect(m.variables).toContain('t2m')
    expect(m.region).toBe('swus')
    expect(m.topic).toBe('heat')
    expect(matchQuestion('Are the hottest days getting hotter in the Amazon?').variables[0]).toBe('tmax')
  })
  it('keeps plain warming questions on air temperature', () => {
    expect(matchQuestion('Is Phoenix getting hotter?').variables).toEqual(['t2m'])
    expect(matchQuestion('Is the climate warming in Alberta?').variables).toEqual(['t2m'])
  })
  it('understands humidity, including "the air is getting drier"', () => {
    const m = matchQuestion('Is it getting more humid in Bihar?')
    expect(m.variables).toEqual(['humidity'])
    expect(m.region).toBe('igp')
    expect(m.topic).toBe('water')
    expect(matchQuestion('Is the air getting drier in Arizona?').variables[0]).toBe('humidity')
    expect(matchQuestion('Is the soil getting drier in Arizona?').variables).toEqual(['soil'])
  })
  it('opens cloud cover for cloud questions, with sunlight as a second clue', () => {
    const m = matchQuestion('Is it getting cloudier over Beijing?')
    expect(m.variables).toEqual(['cloud', 'sun'])
    expect(m.region).toBe('ncp')
    expect(m.topic).toBe('air')
  })
  it('understands wind words and sends other places to the geocoder', () => {
    const m = matchQuestion('Is it getting windier in Chicago?')
    expect(m.variables).toEqual(['wind'])
    expect(m.region).toBeUndefined()
    expect(m.placeText).toBe('Chicago')
    expect(matchQuestion('Are the winds slowing down over the Sahel?')).toMatchObject({ variables: ['wind'], region: 'sahel' })
  })
})

const catalog: Catalog = JSON.parse(readFileSync(join(__dirname, '../../public/data/catalog.json'), 'utf8'))
const published = Object.keys(catalog.variables).filter((v) => Object.values(catalog.results).some((r) => r[v]))

describe('every published variable can be asked about', () => {
  it.each(published)('%s has question words and the catalog topic', (vid) => {
    expect(QUESTION_VARIABLES).toContain(vid)
    expect(QUESTION_TOPICS[vid]).toBe(catalog.variables[vid].topic)
  })
  it('every NASA POWER variable also works in Anywhere live mode, in one request', () => {
    const power = published.filter((v) => catalog.variables[v].source.includes('NASA POWER'))
    expect(power.length).toBeGreaterThanOrEqual(10)
    for (const v of power) expect(LIVE_VARIABLES).toContain(v)
    const params = new URL(pointUrl(catalog, 12.97, 77.59)).searchParams.get('parameters')!.split(',')
    expect(params).toHaveLength(LIVE_VARIABLES.length)
    expect(params).toEqual(expect.arrayContaining(['T2M_MAX', 'RH2M', 'CLOUD_AMT', 'WS2M']))
    expect(params.length).toBeLessThanOrEqual(15) // per-request limit noted in pipeline/power.py
  })
})
