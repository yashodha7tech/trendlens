import type { TopicId } from './types'

/**
 * Turns a free-text question into a place and the variables it is about.
 * Plain keyword matching: transparent, predictable and fast.
 */

const VAR_WORDS: [RegExp, string][] = [
  [/\b(rain|rainfall|precip\w*|monsoon|wet(ter)?|storms?|showers?)\b/, 'precip'],
  [/\b(drought|dry(ing|er)?|soil|moisture)\b/, 'soil'],
  [/\b(evapo\w*|evaporat\w*|transpiration|water vapou?r loss)\b/, 'evap'],
  [/\b(hot(ter)?|heat|warm(ing|er)?|temperature|cold(er)?|cool(ing|er)?|climate)\b/, 't2m'],
  [/\b(green(ing|er|ness)?|brown(ing)?|vegetation|plants?|crops?|ndvi|leaf|leaves|grass)\b/, 'ndvi'],
  [/\b(forests?|trees?|deforest\w*|logging|canopy|jungle)\b/, 'tree'],
  [/\b(pollut\w*|haz[ey]|smog|aerosols?|smoke|dust|air quality|particles?|aod|fires?|burning)\b/, 'aod'],
  [/\b(sun|sunny|sunlight|sunshine|solar|dimming|brightening|radiation|cloud(s|y)?)\b/, 'sun'],
]

const TOPIC_OF: Record<string, TopicId> = { t2m: 'heat', precip: 'water', soil: 'water', evap: 'water', ndvi: 'vegetation', tree: 'vegetation', aod: 'air', sun: 'air' }

const PLACE_WORDS: [RegExp, string][] = [
  [/\b(sahel|niger|niamey|chad|mali|burkina|sahara|west africa|nigeria|kano)\b/, 'sahel'],
  [/\b(india|indian|ganges|gangetic|ganga|uttar pradesh|bihar|lucknow|patna|varanasi|kanpur|delhi|agra)\b/, 'igp'],
  [/\b(china|chinese|beijing|tianjin|hebei|shandong|henan|north china)\b/, 'ncp'],
  [/\b(amazon\w*|brazil\w*|rondonia|rondônia|mato grosso|pará)\b/, 'samazon'],
  [/\b(arizona|new mexico|utah|colorado|four corners|southwest|south-west|phoenix|albuquerque|las vegas|lake mead|lake powell|usa|united states)\b/, 'swus'],
  [/\b(canada|canadian|alberta|saskatchewan|prairies?|calgary|edmonton|regina|saskatoon)\b/, 'prairies'],
]

export interface QuestionMatch {
  variables: string[]
  topic?: TopicId
  region?: string
  placeText?: string
}

export function matchQuestion(q: string): QuestionMatch {
  const s = q.toLowerCase()
  const variables = VAR_WORDS.filter(([re]) => re.test(s)).map(([, v]) => v)
  const region = PLACE_WORDS.find(([re]) => re.test(s))?.[1]
  // anything after "in"/"over"/"near"/"around" is treated as a place name for the geocoder
  const m = q.match(/\b(?:in|over|near|around|at|for)\s+([A-Z][\w\s.'-]{1,60}|[a-z][\w\s.'-]{2,60})\??$/)
  const placeText = m ? m[1].replace(/\b(getting|becoming|changing)\b.*$/i, '').trim().replace(/[?.!]+$/, '') : undefined
  return { variables: [...new Set(variables)], topic: variables[0] ? TOPIC_OF[variables[0]] : undefined, region, placeText }
}
