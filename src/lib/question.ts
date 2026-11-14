import type { TopicId } from './types'

/**
 * Turns a free-text question into a place and the variables it is about.
 * Plain keyword matching: transparent, predictable and fast.
 */

// Order matters: the first variable that matches is the one a question opens. Specific words
// come before general ones, so "heatwaves" opens hottest-day temperature before air temperature,
// "cloudier" opens cloud cover before sunlight and "the air is getting drier" opens humidity.
const VAR_WORDS: [RegExp, string][] = [
  [/\b(rain(s|y|ier|fall)?|precip\w*|monsoons?|wet(ter)?|storms?|showers?|flood\w*)\b/, 'precip'],
  [/\b(humid\w*|mugg(y|ier|iest|iness)|sultr(y|ier)|stick(y|ier)|dew|water vapou?r|damp(er|ness)?|(dry|drier|dryer) air|air( is| getting| becoming| turning)* (dry|drier|dryer))\b/, 'humidity'],
  [/\b(droughts?|dry(ing)?|drier|soils?|moisture)\b/, 'soil'],
  [/\b(evapo\w*|evaporat\w*|transpiration)\b/, 'evap'],
  [/\b(hottest|heat ?waves?|extreme heat|scorch\w*|swelter\w*|hot (days?|spells?|afternoons?)|peak (heat|temperatures?)|max(imum)? temperatures?|highest temperatures?|record (heat|highs?))\b/, 'tmax'],
  [/\b(hot(ter|test)?|heat(ing|waves?)?|warm(ing|er|est)?|temperatures?|cold(er)?|cool(ing|er)?|climate)\b/, 't2m'],
  [/\b(green(ing|er|ness)?|brown(ing|er)?|vegetation|plants?|crops?|ndvi|leaf|leaves|grass(land)?s?)\b/, 'ndvi'],
  [/\b(forests?|trees?|deforest\w*|logging|canopy|jungles?)\b/, 'tree'],
  [/\b(pollut\w*|haz(e|y|ier|iness)|smog\w*|aerosols?|smok(e|y|ier)|dust(y|ier)?|air quality|particles?|particulates?|aod|fires?|burning)\b/, 'aod'],
  [/\b(cloud(s|y|ier|iest|iness)?|overcast)\b/, 'cloud'],
  [/\b(sun(ny|nier)?|sunlight|sunshine|solar|dimm(ing|er)|bright(ening|er)|radiation|cloud(s|y|ier|iness)?)\b/, 'sun'],
  [/\b(wind(s|y|ier|iest|iness)?|breez(e|es|y|ier)|gust(s|y|ier)?|gales?|stilling)\b/, 'wind'],
]

const TOPIC_OF: Record<string, TopicId> = {
  t2m: 'heat',
  tmax: 'heat',
  precip: 'water',
  soil: 'water',
  evap: 'water',
  humidity: 'water',
  ndvi: 'vegetation',
  tree: 'vegetation',
  aod: 'air',
  sun: 'air',
  cloud: 'air',
  wind: 'air',
}

/** Every variable a question can point to, with its topic (checked against the catalog in tests). */
export const QUESTION_TOPICS: Readonly<Record<string, TopicId>> = TOPIC_OF
export const QUESTION_VARIABLES: readonly string[] = [...new Set(VAR_WORDS.map(([, v]) => v))]

const PLACE_WORDS: [RegExp, string][] = [
  [/\b(sahel|niger|niamey|zinder|maradi|northern nigeria|kano|sokoto)\b/, 'sahel'],
  [/\b(india|indian|ganges|gangetic|ganga|uttar pradesh|bihar|lucknow|patna|varanasi|kanpur|agra|prayagraj|allahabad)\b/, 'igp'],
  [/\b(china|chinese|beijing|tianjin|hebei|shandong|henan|north china)\b/, 'ncp'],
  [/\b(amazon\w*|rondonia|rondônia|mato grosso|pará|cuiab[aá])\b/, 'samazon'],
  [/\b(arizona|new mexico|utah|colorado|four corners|southwest|south-west|phoenix|tucson|albuquerque|santa fe|lake powell)\b/, 'swus'],
  [/\b(canadian prairies?|prairies?|alberta|saskatchewan|edmonton|regina|saskatoon|red deer)\b/, 'prairies'],
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
  if (variables.includes('ndvi') && !variables.includes('tree')) variables.push('tree') // fallback when greenness is unavailable
  const region = PLACE_WORDS.find(([re]) => re.test(s))?.[1]
  // anything after "in"/"over"/"near"/"around" is treated as a place name for the geocoder
  const m = q.match(/\b(?:in|over|near|around|at|for)\s+([A-Z][\w\s.'-]{1,60}|[a-z][\w\s.'-]{2,60})\??$/)
  const placeText = m ? m[1].replace(/\b(getting|becoming|changing)\b.*$/i, '').trim().replace(/[?.!]+$/, '') : undefined
  return { variables: [...new Set(variables)], topic: variables[0] ? TOPIC_OF[variables[0]] : undefined, region, placeText }
}
