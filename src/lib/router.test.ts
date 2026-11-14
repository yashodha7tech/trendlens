import { describe, expect, it } from 'vitest'
import { href, parseHash } from './router'

describe('parseHash', () => {
  it('splits the path and reads the query', () => {
    const r = parseHash('#/trend/igp/t2m?start=2001')
    expect(r.path).toEqual(['trend', 'igp', 't2m'])
    expect(r.query.get('start')).toBe('2001')
  })

  it('round-trips links made by href', () => {
    const r = parseHash(href(['anywhere', 'Delhi, India'], { q: 'is it getting hazier?' }))
    expect(r.path).toEqual(['anywhere', 'Delhi, India'])
    expect(r.query.get('q')).toBe('is it getting hazier?')
  })

  it('keeps malformed escapes instead of throwing', () => {
    expect(parseHash('#/explore/%E0%A4').path).toEqual(['explore', '%E0%A4'])
    expect(parseHash('#/100%').path).toEqual(['100%'])
  })

  it('treats an empty hash as the home route', () => {
    expect(parseHash('').path).toEqual([])
    expect(parseHash('#/').path).toEqual([])
  })
})
