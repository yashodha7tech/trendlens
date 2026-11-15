/**
 * Impact: why a change matters.
 *
 * TrendLens's statistics answer one question: did this variable change in this place, beyond chance?
 * Everything in this file is CONTEXT from published research about why a change like that matters to
 * people. None of it is a conclusion of our test, none of it is a forecast, and none of it says what
 * caused a trend.
 *
 * Every claim names its sources by id (see SOURCES). Each source was fetched and read by the team, and
 * the comment above each claim gives the source URL and a short quote that supports it.
 *
 * Variables without an entry fall back to GENERIC, so new variable ids work without code changes.
 */
import type { Verdict } from './stats'

// ------------------------------------------------------------------ sources

export type SourceOrg = 'NASA' | 'IPCC' | 'WHO' | 'FAO' | 'Paper'

export interface Source {
  org: SourceOrg
  /** Citation as shown on the Sources page. */
  cite: string
  /** Short label for inline credits. */
  short: string
  url: string
  doi?: string
}

const SOURCE_TABLE = {
  'ipcc-wg1': {
    org: 'IPCC',
    short: 'IPCC AR6 WGI',
    cite: 'IPCC (2021). Summary for Policymakers. In: Climate Change 2021: The Physical Science Basis. Contribution of Working Group I to the Sixth Assessment Report of the Intergovernmental Panel on Climate Change. Cambridge University Press.',
    url: 'https://www.ipcc.ch/report/ar6/wg1/downloads/report/IPCC_AR6_WGI_SPM.pdf',
  },
  'ipcc-wg2': {
    org: 'IPCC',
    short: 'IPCC AR6 WGII',
    cite: 'IPCC (2022). Summary for Policymakers. In: Climate Change 2022: Impacts, Adaptation and Vulnerability. Contribution of Working Group II to the Sixth Assessment Report of the Intergovernmental Panel on Climate Change. Cambridge University Press.',
    url: 'https://www.ipcc.ch/report/ar6/wg2/downloads/report/IPCC_AR6_WGII_SummaryForPolicymakers.pdf',
  },
  'who-heat': {
    org: 'WHO',
    short: 'WHO',
    cite: 'World Health Organization. Climate change, heat and health (fact sheet).',
    url: 'https://www.who.int/news-room/fact-sheets/detail/climate-change-heat-and-health',
  },
  'who-air': {
    org: 'WHO',
    short: 'WHO',
    cite: 'World Health Organization. Ambient (outdoor) air pollution and health (fact sheet).',
    url: 'https://www.who.int/news-room/fact-sheets/detail/ambient-(outdoor)-air-quality-and-health',
  },
  'who-drought': {
    org: 'WHO',
    short: 'WHO',
    cite: 'World Health Organization. Drought (health topic).',
    url: 'https://www.who.int/health-topics/drought',
  },
  'who-floods': {
    org: 'WHO',
    short: 'WHO',
    cite: 'World Health Organization. Floods (health topic).',
    url: 'https://www.who.int/health-topics/floods',
  },
  'nasa-aerosols': {
    org: 'NASA',
    short: 'NASA Earth Observatory',
    cite: 'NASA Earth Observatory. Aerosols: Tiny Particles, Big Impact.',
    url: 'https://science.nasa.gov/earth/earth-observatory/aerosols/',
  },
  'nasa-ndvi': {
    org: 'NASA',
    short: 'NASA Earth Observatory',
    cite: 'NASA Earth Observatory. Measuring Vegetation (NDVI & EVI).',
    url: 'https://science.nasa.gov/earth/earth-observatory/measuring-vegetation-ndvi-evi/',
  },
  'nasa-mead': {
    org: 'NASA',
    short: 'NASA Earth Observatory',
    cite: 'NASA Earth Observatory (2022). Lake Mead Keeps Dropping.',
    url: 'https://science.nasa.gov/earth/earth-observatory/lake-mead-keeps-dropping-150111/',
  },
  'earthdata-mead': {
    org: 'NASA',
    short: 'NASA Earthdata',
    cite: 'NASA Earthdata (2026). Low Water Levels in Lake Powell and Lake Mead in August 2026. Worldview Image of the Week, 24 August 2026.',
    url: 'https://www.earthdata.nasa.gov/news/worldview-image-archive/low-water-levels-lake-powell-lake-mead-august-2026',
  },
  smap: {
    org: 'NASA',
    short: 'NASA SMAP',
    cite: 'NASA Jet Propulsion Laboratory. SMAP, Soil Moisture Active Passive mission: Why it matters.',
    url: 'https://smap.jpl.nasa.gov/',
  },
  ecostress: {
    org: 'NASA',
    short: 'NASA ECOSTRESS',
    cite: 'NASA Jet Propulsion Laboratory. ECOSTRESS science and applications.',
    url: 'https://ecostress.jpl.nasa.gov/science',
  },
  'nasa-power': {
    org: 'NASA',
    short: 'NASA POWER',
    cite: 'NASA Langley Research Center. POWER: Prediction Of Worldwide Energy Resources.',
    url: 'https://power.larc.nasa.gov/',
  },
  'fao-forests': {
    org: 'FAO',
    short: 'FAO',
    cite: 'FAO (2025). Global deforestation slows, but forests remain under pressure, FAO report shows (Global Forest Resources Assessment 2025), 21 October 2025.',
    url: 'https://www.fao.org/newsroom/detail/global-deforestation-slows--but-forests-remain-under-pressure--fao-report-shows/en',
  },
  'fao-disasters': {
    org: 'FAO',
    short: 'FAO',
    cite: 'FAO (2023). First-ever global estimation of the impact of disasters on agriculture (The Impact of Disasters on Agriculture and Food Security 2023), 13 October 2023.',
    url: 'https://www.fao.org/newsroom/detail/first-ever-global-estimation-of-the-impact-of-disasters-on-agriculture/en',
  },
  gatti2021: {
    org: 'Paper',
    short: 'Gatti et al. 2021',
    cite: 'Gatti, L. V., et al. (2021). Amazonia as a carbon source linked to deforestation and climate change. Nature, 595, 388–393.',
    url: 'https://doi.org/10.1038/s41586-021-03629-6',
    doi: '10.1038/s41586-021-03629-6',
  },
  smith2023: {
    org: 'Paper',
    short: 'Smith et al. 2023',
    cite: 'Smith, C., Baker, J. C. A., & Spracklen, D. V. (2023). Tropical deforestation causes large reductions in observed precipitation. Nature, 615, 270–275.',
    url: 'https://doi.org/10.1038/s41586-022-05690-1',
    doi: '10.1038/s41586-022-05690-1',
  },
  butt2023: {
    org: 'Paper',
    short: 'Butt et al. 2023',
    cite: 'Butt, E. W., Baker, J. C. A., Bezerra, F. G. S., von Randow, C., Aguiar, A. P. D., & Spracklen, D. V. (2023). Amazon deforestation causes strong regional warming. PNAS, 120, e2309123120.',
    url: 'https://doi.org/10.1073/pnas.2309123120',
    doi: '10.1073/pnas.2309123120',
  },
  burney2014: {
    org: 'Paper',
    short: 'Burney & Ramanathan 2014',
    cite: 'Burney, J., & Ramanathan, V. (2014). Recent climate and air pollution impacts on Indian agriculture. PNAS, 111, 16319–16324.',
    url: 'https://doi.org/10.1073/pnas.1317275111',
    doi: '10.1073/pnas.1317275111',
  },
  zhang2019: {
    org: 'Paper',
    short: 'Zhang et al. 2019',
    cite: 'Zhang, Q., et al. (2019). Drivers of improved PM2.5 air quality in China from 2013 to 2017. PNAS, 116, 24463–24469.',
    url: 'https://doi.org/10.1073/pnas.1907956116',
    doi: '10.1073/pnas.1907956116',
  },
  rodell2009: {
    org: 'Paper',
    short: 'Rodell et al. 2009',
    cite: 'Rodell, M., Velicogna, I., & Famiglietti, J. S. (2009). Satellite-based estimates of groundwater depletion in India. Nature, 460, 999–1002.',
    url: 'https://doi.org/10.1038/nature08238',
    doi: '10.1038/nature08238',
  },
  wild2009: {
    org: 'Paper',
    short: 'Wild 2009',
    cite: 'Wild, M. (2009). Global dimming and brightening: A review. Journal of Geophysical Research: Atmospheres, 114.',
    url: 'https://doi.org/10.1029/2008JD011470',
    doi: '10.1029/2008JD011470',
  },
  sweerts2019: {
    org: 'Paper',
    short: 'Sweerts et al. 2019',
    cite: 'Sweerts, B., Pfenninger, S., Yang, S., Folini, D., van der Zwaan, B., & Wild, M. (2019). Estimation of losses in solar energy production from air pollution in China since 1960 using surface radiation data. Nature Energy, 4, 657–663.',
    url: 'https://doi.org/10.1038/s41560-019-0412-4',
    doi: '10.1038/s41560-019-0412-4',
  },
  williams2022: {
    org: 'Paper',
    short: 'Williams et al. 2022',
    cite: 'Williams, A. P., Cook, B. I., & Smerdon, J. E. (2022). Rapid intensification of the emerging southwestern North American megadrought in 2020–2021. Nature Climate Change, 12, 232–234.',
    url: 'https://doi.org/10.1038/s41558-022-01290-z',
    doi: '10.1038/s41558-022-01290-z',
  },
} satisfies Record<string, Source>

export type SourceId = keyof typeof SOURCE_TABLE
export const SOURCES: Record<SourceId, Source> = SOURCE_TABLE
export const SOURCE_IDS = Object.keys(SOURCE_TABLE) as SourceId[]

// ------------------------------------------------------------------ content types

export type Area = 'health' | 'food' | 'water' | 'energy' | 'ecosystems' | 'climate'

export const AREA_LABEL: Record<Area, string> = {
  health: 'Health',
  food: 'Food',
  water: 'Water',
  energy: 'Energy',
  ecosystems: 'Ecosystems',
  climate: 'Climate clue',
}

export interface Claim {
  text: string
  src: SourceId[]
}

export interface Point extends Claim {
  area: Area
}

export interface DirectionImpact {
  /** One-line framing for this direction of change. */
  lead: Claim
  points: Point[]
}

export type UseKind = 'Planning' | 'Adaptation' | 'Early warning'

export interface Use extends Claim {
  kind: UseKind
}

export interface VariableImpact {
  /** One line for the Explore page. */
  teaser: string
  rising: DirectionImpact
  falling: DirectionImpact
  /** Who is affected most. */
  people: Claim
  /** How this information is used. */
  uses: Use[]
}

// ------------------------------------------------------------------ per-variable content

const VARIABLES: Record<string, VariableImpact> = {
  t2m: {
    teaser: 'Heat affects health, harvests and the power and water systems people rely on.',
    rising: {
      // ipcc-wg1 https://www.ipcc.ch/report/ar6/wg1/downloads/report/IPCC_AR6_WGI_SPM.pdf (A.3.1):
      // "It is virtually certain that hot extremes (including heatwaves) have become more frequent and more intense across most land regions since the 1950s"
      lead: { text: 'Across most land regions, heatwaves have become more frequent and more intense since the 1950s.', src: ['ipcc-wg1'] },
      points: [
        {
          area: 'health',
          // who-heat https://www.who.int/news-room/fact-sheets/detail/climate-change-heat-and-health:
          // "Between 2000–2019 studies show approximately 489 000 heat-related deaths occur each year, with 45% of these in Asia and 36% in Europe"
          // ipcc-wg2 (B.1.4): "In all regions extreme heat events have resulted in human mortality and morbidity (very high confidence)."
          text: 'Heat kills. Studies cited by WHO estimate about 489,000 heat-related deaths a year between 2000 and 2019, and IPCC finds extreme heat has caused deaths and illness in all regions.',
          src: ['who-heat', 'ipcc-wg2'],
        },
        {
          area: 'food',
          // ipcc-wg2 (B.1.3): "Although overall agricultural productivity has increased, climate change has slowed this growth over the past 50 years globally (medium confidence), related negative impacts were mainly in mid- and low latitude regions"
          text: 'Farm productivity is still growing worldwide, but climate change has slowed that growth over the past 50 years, mostly in low and mid latitudes.',
          src: ['ipcc-wg2'],
        },
        {
          area: 'water',
          // ipcc-wg1 (A.3.2): "Human-induced climate change has contributed to increases in agricultural and ecological droughts in some regions due to increased land evapotranspiration (medium confidence)."
          text: 'Warmer air pulls more water out of soils and plants. IPCC links this extra evaporation to more farm and ecological droughts in some regions.',
          src: ['ipcc-wg1'],
        },
        {
          area: 'energy',
          // who-heat: "Heat can also disrupt and compromise essential health services, such as the loss of power supply and transport."
          // ipcc-wg2 (B.1.5): "Hot extremes including heatwaves have intensified in cities (high confidence), where they have also aggravated air pollution events (medium confidence) and limited functioning of key infrastructure (high confidence)."
          text: 'Heat can knock out power supply and transport, and in cities heatwaves have limited how well key infrastructure works.',
          src: ['who-heat', 'ipcc-wg2'],
        },
        {
          area: 'ecosystems',
          // ipcc-wg2 (B.1.1): "...observed impacts have been attributed to human-induced climate change particularly through increased frequency and severity of extreme events. These include increased heat-related human mortality (medium confidence), warm-water coral bleaching and mortality (high confidence), and increased drought-related tree mortality (high confidence)."
          text: 'More frequent hot and dry extremes have been tied to more trees dying in droughts.',
          src: ['ipcc-wg2'],
        },
      ],
    },
    falling: {
      // ipcc-wg1 (A.3.1): "...while cold extremes (including cold waves) have become less frequent and less severe"
      lead: {
        text: 'Most land has been warming, with cold extremes becoming rarer and milder, so a local cooling stands out and is worth a second look.',
        src: ['ipcc-wg1'],
      },
      points: [
        {
          area: 'climate',
          // nasa-aerosols https://science.nasa.gov/earth/earth-observatory/aerosols/:
          // "Black carbon aerosols ... absorb sunlight rather than reflecting it. This warms the layer of the atmosphere carrying the black carbon, but also shades and cools the surface below."
          // "Models estimate that aerosols have had a cooling effect that has counteracted about half of the warming caused by the build-up of greenhouse gases since the 1880s."
          text: 'Haze can shade and cool the ground. Models estimate aerosols have offset about half of the warming from greenhouse gases since the 1880s, so check haze and sunlight for the same place.',
          src: ['nasa-aerosols'],
        },
        {
          area: 'health',
          // who-heat: "Regularly check in with vulnerable people in your circle – especially people over 65 years old and those with heart, lung or kidney conditions"
          // who-heat: "Outdoor and manual workers, athletes and civil protection employees are exposed to excess heat because of their work"
          text: 'If cooling means fewer very hot days, the people most at risk from heat, such as those over 65 and outdoor workers, would face less heat stress.',
          src: ['who-heat'],
        },
      ],
    },
    // who-heat: "especially people over 65 years old and those with heart, lung or kidney conditions, a disability, and living alone"
    // who-heat: "Outdoor and manual workers, athletes and civil protection employees are exposed to excess heat"
    // who-heat: "Urban and rural poor are often disproportionately exposed to overheating due to low quality housing and lack of access to cooling."
    people: {
      text: 'People over 65, infants and children, people with heart, lung or kidney conditions, outdoor and manual workers, and poorer households without cooling.',
      src: ['who-heat'],
    },
    uses: [
      {
        kind: 'Early warning',
        // ipcc-wg2 (C.2.11): "Heat Health Action Plans that include early warning and response systems are effective adaptation options for extreme heat (high confidence)."
        text: 'Heat-health action plans with early warning and response systems are an effective way to adapt to extreme heat.',
        src: ['ipcc-wg2'],
      },
      {
        kind: 'Planning',
        // who-heat: "WHO works with the health sector to strengthen governance, preparedness and response to acute impacts of heatwaves by developing heat action plans, heat early warning systems and advisories, and emergency response plans"
        text: 'Health services use long-term heat trends to plan heat action plans, advisories and emergency response.',
        src: ['who-heat'],
      },
    ],
  },

  precip: {
    teaser: 'Rain fills rivers, wells and fields. Too much brings floods; too little brings drought.',
    rising: {
      // ipcc-wg1 (A.3.2): "The frequency and intensity of heavy precipitation events have increased since the 1950s over most land area for which observational data are sufficient for trend analysis (high confidence)"
      lead: { text: 'Heavy downpours have become more frequent and more intense over most land areas since the 1950s.', src: ['ipcc-wg1'] },
      points: [
        {
          area: 'health',
          // who-floods https://www.who.int/health-topics/floods: "Between 1998-2017, floods affected more than 2 billion people worldwide."
          // who-floods: "Drowning accounts for 75% of deaths in flood disasters."
          // who-floods: "water- and vector-borne diseases, such as cholera, typhoid or malaria"
          text: 'Floods affected more than 2 billion people between 1998 and 2017. Drowning causes most flood deaths, and flood water can spread cholera, typhoid and malaria.',
          src: ['who-floods'],
        },
        {
          area: 'food',
          // fao-disasters: "an estimated $3.8 trillion worth of crops and livestock production has been lost due to disaster events, corresponding to an average loss of $123 billion per year"
          text: 'Disasters such as floods have cost an estimated US$3.8 trillion in lost crops and livestock over 30 years, about US$123 billion a year.',
          src: ['fao-disasters'],
        },
        {
          area: 'ecosystems',
          // nasa-ndvi https://science.nasa.gov/earth/earth-observatory/measuring-vegetation-ndvi-evi/:
          // "heavy rain in the Northern Great Plains ... led to flooding in the Missouri River. The resulting exceptionally lush vegetation appears as a positive anomaly"
          text: 'Extra rain can also green the land: in 1993, heavy rain over the Northern Great Plains brought both floods and exceptionally lush vegetation.',
          src: ['nasa-ndvi'],
        },
      ],
    },
    falling: {
      // who-drought https://www.who.int/health-topics/drought: "they are the most serious hazard to livestock and crops in nearly every part of the world"
      lead: { text: 'Less rain can mean drought, the most serious hazard to crops and livestock in nearly every part of the world.', src: ['who-drought'] },
      points: [
        {
          area: 'health',
          // who-drought: "An estimated 55 million people globally are affected by droughts every year"
          // who-drought: "malnutrition due to the decreased availability of food" ; "increased risk of infectious diseases, such as cholera, diarrhoea, and pneumonia"
          text: 'Droughts affect an estimated 55 million people every year, bringing malnutrition and diseases such as cholera and diarrhoea.',
          src: ['who-drought'],
        },
        {
          area: 'water',
          // ipcc-wg2 (B.1.3): "Roughly half of the world's population currently experience severe water scarcity for at least some part of the year due to climatic and non-climatic drivers (medium confidence)."
          text: "Roughly half of the world's people already face severe water scarcity for at least part of the year.",
          src: ['ipcc-wg2'],
        },
        {
          area: 'health',
          // who-drought: "Severe drought can also affect air quality by making wildfires and dust storms more likely"
          text: 'Severe drought makes wildfires and dust storms more likely, which harms people with lung and heart disease.',
          src: ['who-drought'],
        },
        {
          area: 'ecosystems',
          // smith2023 https://doi.org/10.1038/s41586-022-05690-1: "Tropical forests play a critical role in the hydrological cycle and can influence local and regional precipitation."
          // smith2023: "Here we show reduced precipitation over deforested regions across the tropics."
          text: 'Forests help make rain: a pan-tropical study found less rain over deforested regions.',
          src: ['smith2023'],
        },
      ],
    },
    // who-floods: "People who live in floodplains or non-resistant buildings, or lack warning systems and awareness of flooding hazard, are most vulnerable to floods."
    // who-drought: "Drought threatens people's livelihoods, increases the risk of disease and death, and fuels mass migration."
    people: {
      text: 'Farmers and herders whose livelihoods depend on rain, and people living on floodplains or in fragile homes without flood warnings.',
      src: ['who-drought', 'who-floods'],
    },
    uses: [
      {
        kind: 'Early warning',
        // ipcc-wg2 (C.2.1): "For inland flooding, combinations of non-structural measures like early warning systems and structural measures like levees have reduced loss of lives (medium confidence)."
        text: 'Flood early warning systems, together with levees, have reduced loss of life.',
        src: ['ipcc-wg2'],
      },
      {
        kind: 'Planning',
        // ipcc-wg2 (C.2.1): "land use planning such as no build zones or upstream forest management, can further reduce flood risk"
        text: 'Land-use planning, such as no-build zones and upstream forest management, can further cut flood risk.',
        src: ['ipcc-wg2'],
      },
    ],
  },

  soil: {
    teaser: 'Soil moisture is the water crops and forests can actually reach between rains.',
    rising: {
      // smap https://smap.jpl.nasa.gov/ ("Why it Matters"): "Improving Weather Forecasts", "Monitoring Droughts", "Predicting Floods", "Assisting Crop Productivity"
      lead: { text: 'Wetter soils hold more water for plants. NASA tracks soil moisture to help predict floods and support crop forecasts.', src: ['smap'] },
      points: [
        {
          area: 'food',
          // smap: "SMAP data are now being used operationally by the U.S. Department of Agriculture (USDA) to monitor global croplands and make commodity forecasts."
          text: 'Soil moisture is used to monitor croplands worldwide and forecast harvests.',
          src: ['smap'],
        },
        {
          area: 'water',
          // smap ("Why it Matters"): "Predicting Floods"
          // ipcc-wg1 (A.3.2): heavy precipitation events have increased since the 1950s over most land area
          text: 'Wet ground is one of the signals used to predict floods, which matters more as heavy downpours grow more common.',
          src: ['smap', 'ipcc-wg1'],
        },
      ],
    },
    falling: {
      // ipcc-wg1 (A.3.2): "Human-induced climate change has contributed to increases in agricultural and ecological droughts in some regions due to increased land evapotranspiration (medium confidence)."
      lead: {
        text: 'Drying soils are the mark of farm and ecological drought, which IPCC finds has increased in some regions.',
        src: ['ipcc-wg1'],
      },
      points: [
        {
          area: 'food',
          // who-drought: drought is "the most serious hazard to livestock and crops in nearly every part of the world"
          // fao-disasters: "losses in cereals amounted to an average of 69 million tonnes per year in the last three decades"
          text: 'Drought is the most serious hazard to crops and livestock almost everywhere. Disasters have cost an average of 69 million tonnes of cereals a year over three decades.',
          src: ['who-drought', 'fao-disasters'],
        },
        {
          area: 'health',
          // who-drought: "When drought causes water and food shortages there can be many impacts on the health of the affected population, which may increase the risk of disease and death."
          text: 'When drought causes water and food shortages, the risk of disease and death rises.',
          src: ['who-drought'],
        },
        {
          area: 'ecosystems',
          // ipcc-wg2 (B.1.1): "increased drought-related tree mortality (high confidence)"
          text: 'Long dry spells kill trees: drought-related tree deaths have increased.',
          src: ['ipcc-wg2'],
        },
      ],
    },
    // who-drought: "Drought threatens people's livelihoods"; smap: USDA uses SMAP "to monitor global croplands"
    people: { text: 'Farmers and herders first, then everyone who buys food when harvests fail.', src: ['who-drought', 'smap'] },
    uses: [
      {
        kind: 'Early warning',
        // smap ("Why it Matters"): "Monitoring Droughts" ; "Predicting Floods"
        text: "Satellite soil moisture from NASA's SMAP mission helps monitor droughts and predict floods.",
        src: ['smap'],
      },
      {
        kind: 'Planning',
        // smap: USDA uses SMAP "to monitor global croplands and make commodity forecasts"
        text: 'Agriculture agencies use soil moisture to forecast crops and markets.',
        src: ['smap'],
      },
    ],
  },

  evap: {
    teaser: 'Evaporation is how land and plants hand water back to the sky, the other half of the rain story.',
    rising: {
      // ipcc-wg1 (A.3.2): "...increases in agricultural and ecological droughts in some regions due to increased land evapotranspiration"
      lead: {
        text: 'When heat drives it, rising evaporation dries out land: IPCC ties increased land evaporation to more droughts in some regions.',
        src: ['ipcc-wg1'],
      },
      points: [
        {
          area: 'food',
          // ecostress https://ecostress.jpl.nasa.gov/science: "Food security and agriculture: maximizing food production and more efficient irrigation practices (crop per drop)"
          text: "In farmland, evaporation tracks how much water crops use. NASA's ECOSTRESS measures it to help grow more 'crop per drop'.",
          src: ['ecostress'],
        },
        {
          area: 'water',
          // rodell2009 https://doi.org/10.1038/nature08238: "unsustainable consumption of groundwater for irrigation and other anthropogenic uses is likely to be the cause"
          text: 'Where irrigation feeds the evaporation, the water often comes from aquifers. In northwest India, satellites showed groundwater draining, likely from pumping for irrigation.',
          src: ['rodell2009'],
        },
      ],
    },
    falling: {
      // smith2023: "Tropical forests play a critical role in the hydrological cycle and can influence local and regional precipitation."
      lead: {
        text: 'Less evaporation means less water going back to the air, and forests help make regional rain.',
        src: ['smith2023'],
      },
      points: [
        {
          area: 'ecosystems',
          // ecostress: "will monitor one of the most basic processes in living plants: the loss of water through the tiny pores in leaves."
          // ecostress: "How do changes in diurnal vegetation water stress impact the global carbon cycle?"
          text: "Plants 'sweat' through tiny pores in their leaves. When they are short of water they sweat less, which is how ECOSTRESS spots water stress.",
          src: ['ecostress'],
        },
        {
          area: 'water',
          // smith2023: "Here we show reduced precipitation over deforested regions across the tropics."
          text: 'In the tropics, regions that lost forest also lost rain. Check rainfall and soil wetness for the same place.',
          src: ['smith2023'],
        },
      ],
    },
    // ecostress: "Can agricultural vulnerability be reduced through advanced monitoring of agricultural water consumptive use and improved drought estimation?"
    people: { text: 'Irrigating farmers, water managers sharing rivers and aquifers, and communities whose rain is recycled from nearby land.', src: ['ecostress', 'smith2023'] },
    uses: [
      {
        kind: 'Adaptation',
        // ecostress: "maximizing food production and more efficient irrigation practices (crop per drop)"
        text: 'Evaporation data help farmers irrigate more efficiently.',
        src: ['ecostress'],
      },
      {
        kind: 'Early warning',
        // ecostress: "improved drought estimation"
        text: 'Plant water use is an early sign of drought stress, used to improve drought estimates.',
        src: ['ecostress'],
      },
    ],
  },

  sun: {
    teaser: 'Sunlight at the ground powers crops and solar panels, and haze can dim it.',
    rising: {
      // wild2009 https://doi.org/10.1029/2008JD011470: "a widespread decrease in surface solar radiation between the 1950s and 1980s ("global dimming"), with a partial recovery more recently at many locations ("brightening")"
      // wild2009: "indicative of an anthropogenic contribution through changes in aerosol emissions governed by economic developments and air pollution regulations."
      lead: {
        text: "Many places dimmed from the 1950s to the 1980s and have partly 'brightened' since, linked to changes in air pollution and its regulation.",
        src: ['wild2009'],
      },
      points: [
        {
          area: 'energy',
          // sweerts2019 https://doi.org/10.1038/s41560-019-0412-4: "reverting back to 1960s radiation levels in China could yield a 12–13% increase in electricity generation"
          text: 'More sunlight means more solar power. In China, returning to 1960s sunlight levels could raise solar panel output by 12 to 13%.',
          src: ['sweerts2019'],
        },
        {
          area: 'climate',
          // wild2009: "potential implications of dimming and brightening for climate change, which may affect global warming, the components and intensity of the hydrological cycle, the carbon cycle"
          text: 'Brightening can add to surface warming and speed up the water and carbon cycles. Check temperature and evaporation too.',
          src: ['wild2009'],
        },
      ],
    },
    falling: {
      // wild2009: "a widespread decrease in surface solar radiation between the 1950s and 1980s ("global dimming")"
      // nasa-aerosols: "aerosols—and clouds seeded by them—reflect about a quarter of the Sun's energy back to space"
      lead: { text: "Less sunlight at the ground, or 'dimming', is often a sign of more haze or cloud.", src: ['wild2009', 'nasa-aerosols'] },
      points: [
        {
          area: 'energy',
          // sweerts2019: "PV potential decreased on average by 11–15% between 1960 and 2015"; "anthropogenic aerosol emissions and changes in cloud cover affect solar radiation in China"
          text: "Dimming cuts solar power: in China, haze and cloud changes lowered solar panels' potential by 11 to 15% between 1960 and 2015.",
          src: ['sweerts2019'],
        },
        {
          area: 'food',
          // burney2014 https://doi.org/10.1073/pnas.1317275111: "yields in 2010 were up to 36% lower for wheat than they otherwise would have been, absent climate and pollutant emissions trends"
          text: 'The pollution behind haze also harms crops: in India, climate and pollution trends left 2010 wheat yields up to 36% lower than they would otherwise have been.',
          src: ['burney2014'],
        },
        {
          area: 'water',
          // wild2009: "may affect ... the components and intensity of the hydrological cycle"
          text: 'Dimming can weaken evaporation and the water cycle.',
          src: ['wild2009'],
        },
      ],
    },
    // nasa-power: "NASA POWER provides solar and meteorological data from satellite observations and models to help worldwide users respond to challenges"
    people: { text: 'Farmers, solar power operators and grid planners, and everyone breathing the haze that blocks the light.', src: ['nasa-power', 'sweerts2019'] },
    uses: [
      {
        kind: 'Planning',
        // nasa-power: "POWERing the Future of Energy, Infrastructure, and Agroclimatology"
        text: "NASA POWER, the source of this app's sunlight data, serves energy, infrastructure and farming decisions worldwide.",
        src: ['nasa-power'],
      },
      {
        kind: 'Adaptation',
        // sweerts2019: "strict air pollution control measures, combined with reduced fossil fuel consumption, would allow surface radiation to increase"
        text: 'Researchers estimate that strict air pollution control would let more sunlight reach the ground.',
        src: ['sweerts2019'],
      },
    ],
  },

  aod: {
    teaser: 'Haze is made of particles we breathe. It also shades the ground, crops and solar panels.',
    rising: {
      // nasa-aerosols: "Even if the air looks clear, it's nearly certain that you'll inhale tens of millions of solid particles and liquid droplets. These ubiquitous specks of matter are known as aerosols"
      lead: { text: 'Aerosols are tiny particles of smoke, dust and pollution. We breathe them, and they block sunlight.', src: ['nasa-aerosols'] },
      points: [
        {
          area: 'health',
          // who-air: "Ambient (outdoor) air pollution is estimated to have caused 4.2 million premature deaths worldwide in 2019."
          // who-air: "this mortality is due to exposure to fine particulate matter, which causes cardiovascular and respiratory disease, and cancers."
          text: 'Outdoor air pollution caused an estimated 4.2 million early deaths in 2019, through fine particles that cause heart and lung disease and cancers.',
          src: ['who-air'],
        },
        {
          area: 'food',
          // burney2014: "Two potent SLCPs, tropospheric ozone and black carbon, have direct effects on crop yields beyond their indirect effects through climate"
          text: 'Soot (black carbon) and ozone pollution cut crop yields directly, on top of their effect on climate.',
          src: ['burney2014'],
        },
        {
          area: 'energy',
          // sweerts2019: "anthropogenic aerosol emissions and changes in cloud cover affect solar radiation in China"
          text: 'Haze blocks sunlight that solar panels need.',
          src: ['sweerts2019'],
        },
        {
          area: 'climate',
          // nasa-aerosols: "Most aerosols are brighter than land or ocean, and cool the Earth by reflecting sunlight back to space."
          text: 'Most aerosols cool the Earth by reflecting sunlight, which can hide part of greenhouse warming.',
          src: ['nasa-aerosols'],
        },
      ],
    },
    falling: {
      // who-air: "In 2019, 99% of the world's population was living in places where the WHO air quality guidelines levels were not met."
      lead: { text: "Clearing haze usually means cleaner air, and 99% of the world's people lived where WHO air quality guidelines were not met in 2019.", src: ['who-air'] },
      points: [
        {
          area: 'health',
          // zhang2019 https://doi.org/10.1073/pnas.1907956116: "national population-weighted annual mean PM2.5 concentrations decreased from 61.8 ... to 42.0 µg/m3 ... in 5 y, with dominant contributions from anthropogenic emission abatements."
          text: 'Policy can clean the air: in China, fine-particle pollution fell from 61.8 to 42.0 µg/m³ between 2013 and 2017, mainly through emission cuts.',
          src: ['zhang2019'],
        },
        {
          area: 'energy',
          // sweerts2019: "strict air pollution control measures, combined with reduced fossil fuel consumption, would allow surface radiation to increase"
          text: 'Cleaner skies let more sunlight reach solar panels and crops.',
          src: ['sweerts2019'],
        },
        {
          area: 'climate',
          // nasa-aerosols: "aerosols have had a cooling effect that has counteracted about half of the warming caused by the build-up of greenhouse gases since the 1880s"
          text: 'Because aerosols have masked about half of greenhouse warming since the 1880s, cleaner air can let more of that warming show.',
          src: ['nasa-aerosols'],
        },
      ],
    },
    // who-air: "People living in low- and middle-income countries disproportionately experience the burden of outdoor air pollution with 89% (of the 4.2 million premature deaths) occurring in these areas. The greatest burden is found in the WHO South-East Asia and Western Pacific Regions."
    people: {
      text: 'Everyone breathes it, but 89% of air pollution deaths are in low- and middle-income countries, most of all in South-East Asia and the Western Pacific.',
      src: ['who-air'],
    },
    uses: [
      {
        kind: 'Planning',
        // who-air: "The WHO Global air quality guidelines (AQG) offer global guidance on thresholds and limits for key air pollutants that pose health risks."
        text: 'WHO air quality guidelines set health-based limits for key pollutants.',
        src: ['who-air'],
      },
      {
        kind: 'Adaptation',
        // zhang2019: "strengthening industrial emission standards ..., upgrades on industrial boilers, phasing out outdated industrial capacities, and promoting clean fuels in the residential sector were major effective"
        text: "Tracking haze shows whether clean-air measures work, as in China's 2013–2017 clean air policy.",
        src: ['zhang2019'],
      },
    ],
  },

  tree: {
    teaser: 'Forests store carbon, help make rain and shelter much of the world’s wildlife.',
    falling: {
      // fao-forests: "the current rate of deforestation at 10.9 million hectares per year still too high"
      lead: { text: 'Deforestation has slowed worldwide but still runs at 10.9 million hectares a year (2015–2025).', src: ['fao-forests'] },
      points: [
        {
          area: 'climate',
          // gatti2021 https://doi.org/10.1038/s41586-021-03629-6: "Southeastern Amazonia, in particular, acts as a net carbon source (total carbon flux minus fire emissions) to the atmosphere."
          text: 'Losing forest releases carbon: south-eastern Amazonia now gives off more carbon than it absorbs.',
          src: ['gatti2021'],
        },
        {
          area: 'water',
          // smith2023: "1 percentage point of forest loss reduced precipitation by 0.25 ± 0.1 mm per month"
          text: 'Across the tropics, each percentage point of forest lost cut rainfall by about 0.25 mm a month at large scales.',
          src: ['smith2023'],
        },
        {
          area: 'health',
          // butt2023 https://doi.org/10.1073/pnas.2309123120: "deforestation of the Amazon caused strong warming at distances up to 100 km away from the forest loss."
          text: 'Clearing the Amazon warmed land up to 100 km away, adding heat for people nearby.',
          src: ['butt2023'],
        },
        {
          area: 'food',
          // fao-forests: "Forests are important for food security, local livelihoods and the provision of renewable biomaterials and energy."
          text: 'Forests support food security and local livelihoods.',
          src: ['fao-forests'],
        },
      ],
    },
    rising: {
      // fao-forests: "help regulate the global carbon and hydrologic cycles, and can reduce the risks and impacts of drought, desertification, soil erosion, landslides and floods."
      lead: { text: 'Growing tree cover can store carbon and reduce the risks of drought, soil erosion, landslides and floods.', src: ['fao-forests'] },
      points: [
        {
          area: 'ecosystems',
          // fao-forests: "They are habitat for a large proportion of the world's biodiversity"
          text: "Forests are home to a large share of the world's wildlife.",
          src: ['fao-forests'],
        },
        {
          area: 'water',
          // fao-forests: forests "help regulate the global carbon and hydrologic cycles"
          text: 'Trees help regulate the water cycle.',
          src: ['fao-forests'],
        },
      ],
    },
    // fao-forests: "Forests are important for food security, local livelihoods"; smith2023 (rain over deforested regions)
    people: { text: 'Communities who live from forests, and farmers downwind who depend on the rain that forests help make.', src: ['fao-forests', 'smith2023'] },
    uses: [
      {
        kind: 'Planning',
        // fao-forests: "Released every five years, the 2025 edition of the report"
        text: "FAO's Global Forest Resources Assessment tracks every country's forests every five years.",
        src: ['fao-forests'],
      },
      {
        kind: 'Early warning',
        // nasa-ndvi: "The maps are helpful in monitoring and understanding environmental and climate changes such as deforestation and desertification as well as drought."
        text: 'Satellite vegetation maps help monitor deforestation, desertification and drought.',
        src: ['nasa-ndvi'],
      },
    ],
  },

  ndvi: {
    teaser: 'Greenness shows how well plants are growing, from crops and pasture to forests.',
    rising: {
      // nasa-ndvi: "Comparing this month's or this year's NDVI data with the 20-year average reveals whether the productivity in a given region is typical, or whether the plant growth is significantly more or less productive."
      lead: { text: 'Greener than usual means plants are growing more than usual.', src: ['nasa-ndvi'] },
      points: [
        {
          area: 'food',
          // nasa-ndvi: "They feed us, clothe us, absorb carbon dioxide, provide us with oxygen, and give us building materials and medications."
          text: 'Plants feed and clothe us and absorb carbon dioxide, so plant growth matters far beyond farms.',
          src: ['nasa-ndvi'],
        },
      ],
    },
    falling: {
      // nasa-ndvi: "NDVI as an Indicator of Drought"
      lead: { text: 'Browning is a standard satellite sign of drought.', src: ['nasa-ndvi'] },
      points: [
        {
          area: 'food',
          // nasa-ndvi: "thousands of people starved when the vegetation in the Sahel region of Africa dried up during an extended drought."
          text: 'When vegetation in the Sahel dried up in an extended drought, thousands of people starved.',
          src: ['nasa-ndvi'],
        },
      ],
    },
    // nasa-ndvi: "When drastic changes occur to the vegetation around us, our health, economy, and environment are all affected."
    people: { text: 'Farmers and herders first, but changes in vegetation affect our health, economy and environment.', src: ['nasa-ndvi'] },
    uses: [
      {
        kind: 'Early warning',
        // nasa-ndvi: "monitoring and understanding environmental and climate changes such as deforestation and desertification as well as drought"
        text: 'Greenness maps help monitor drought, deforestation and desertification.',
        src: ['nasa-ndvi'],
      },
    ],
  },
}

/** Fallback for variables added later without their own entry. */
const GENERIC: VariableImpact = {
  teaser: 'A lasting change in any part of the Earth system can matter for health, food, water, energy and ecosystems.',
  rising: {
    // ipcc-wg2 (B.1.1): "Widespread, pervasive impacts to ecosystems, people, settlements, and infrastructure have resulted from observed increases in the frequency and intensity of climate and weather extremes"
    lead: { text: 'IPCC finds widespread impacts on people and ecosystems from changes in climate and weather extremes.', src: ['ipcc-wg2'] },
    points: [
      {
        area: 'food',
        // ipcc-wg2 (B.1.3): "Climate change including increases in frequency and intensity of extremes have reduced food and water security"
        text: 'More frequent and intense extremes have reduced food and water security.',
        src: ['ipcc-wg2'],
      },
    ],
  },
  falling: {
    lead: { text: 'IPCC finds widespread impacts on people and ecosystems from changes in climate and weather extremes.', src: ['ipcc-wg2'] },
    points: [
      {
        area: 'food',
        // ipcc-wg2 (B.1.3): "Climate change including increases in frequency and intensity of extremes have reduced food and water security"
        text: 'More frequent and intense extremes have reduced food and water security.',
        src: ['ipcc-wg2'],
      },
    ],
  },
  // ipcc-wg2 (B.2): "Approximately 3.3 to 3.6 billion people live in contexts that are highly vulnerable to climate change (high confidence)."
  people: { text: 'About 3.3 to 3.6 billion people live in places highly vulnerable to climate change.', src: ['ipcc-wg2'] },
  uses: [
    {
      kind: 'Adaptation',
      // ipcc-wg2 (C.2.1): "Adaptation to water-related risks and impacts make up the majority of all documented adaptation (high confidence)."
      text: 'Most documented adaptation so far deals with water-related risks.',
      src: ['ipcc-wg2'],
    },
  ],
}

export const IMPACT_VARIABLES = Object.keys(VARIABLES)

export function variableImpact(vid: string): VariableImpact {
  return VARIABLES[vid] ?? GENERIC
}

export function hasOwnImpact(vid: string): boolean {
  return vid in VARIABLES
}

// ------------------------------------------------------------------ featured regions

export interface RegionContext {
  /** Plain-language context from published research. */
  text: string
  src: SourceId[]
  /** People who depend on the place, only where a source gives a figure for it. */
  people?: Claim
}

const REGIONS: Record<string, RegionContext> = {
  sahel: {
    // nasa-ndvi: "thousands of people starved when the vegetation in the Sahel region of Africa dried up during an extended drought."
    // who-drought: drought is "the most serious hazard to livestock and crops in nearly every part of the world" and "fuels mass migration"
    text: 'The Sahel shows what is at stake: when its vegetation dried up in an extended drought, thousands of people starved. Rain and soil water decide harvests and pasture here, and drought also drives migration.',
    src: ['nasa-ndvi', 'who-drought'],
  },
  igp: {
    // nasa-aerosols: "Satellites can detect a visible pall of aerosol clouds over Bangladesh, northern India, and northern Pakistan—an area called the Indo-Gangetic plain ... comprised of complex mixtures of dust blowing from the Thar Desert and pollution from the densely populated plain."
    // burney2014: "yields in 2010 were up to 36% lower for wheat than they otherwise would have been ... with some densely populated states experiencing 50% relative yield losses."
    // rodell2009: "the consequences for the 114,000,000 residents of the region may include a reduction of agricultural output and shortages of potable water"
    text: "Satellites see a pall of haze over the plain, a mix of desert dust and pollution from one of the world's most crowded farm regions. Researchers estimate climate and pollution trends cut India's 2010 wheat yields by up to 36%, and in northwest India groundwater pumped for irrigation is running down.",
    src: ['nasa-aerosols', 'burney2014', 'rodell2009'],
    people: {
      // rodell2009 (study area Rajasthan, Punjab and Haryana, west of this box): "the 114,000,000 residents of the region"
      text: 'In the neighbouring northwest Indian states where groundwater is falling, the study counts 114 million residents.',
      src: ['rodell2009'],
    },
  },
  ncp: {
    // nasa-aerosols: "In eastern China, fast-growing cities such as Beijing also produce heavy blankets of aerosol."
    // zhang2019: PM2.5 "decreased from 61.8 ... to 42.0 µg/m3 ... in 5 y, with dominant contributions from anthropogenic emission abatements."
    // sweerts2019: "PV potential decreased on average by 11–15% between 1960 and 2015"
    text: "Cities such as Beijing produced heavy blankets of haze. After China's 2013 clean air policy, national fine-particle pollution fell from 61.8 to 42.0 µg/m³ by 2017, and researchers estimate that cleaner skies raise solar power output.",
    src: ['nasa-aerosols', 'zhang2019', 'sweerts2019'],
  },
  samazon: {
    // gatti2021: "Southeastern Amazonia, in particular, acts as a net carbon source ... to the atmosphere."
    // smith2023: "Here we show reduced precipitation over deforested regions across the tropics."
    // butt2023: "deforestation of the Amazon caused strong warming at distances up to 100 km away from the forest loss."
    text: 'This is the arc of deforestation. Published studies find that south-eastern Amazonia now releases more carbon than it absorbs, that tropical forest loss reduces rainfall, and that Amazon clearing warms land up to 100 km away.',
    src: ['gatti2021', 'smith2023', 'butt2023'],
  },
  swus: {
    // williams2022: "2000–2021 was the driest 22-yr period since at least 800" ; "~19% of which is attributable to anthropogenic climate trends"
    // earthdata-mead: "The river system supplies water to approximately 40 million people and 5 million acres of farmland"
    // earthdata-mead: "Lake Mead—reached its lowest level ... since it was filled in 1937."
    text: "Soil-moisture records show 2000–2021 was the region's driest 22-year period since at least the year 800. In August 2026, Lake Mead fell to its lowest level since it was first filled in 1937.",
    src: ['williams2022', 'earthdata-mead'],
    people: {
      // earthdata-mead: "The river system supplies water to approximately 40 million people and 5 million acres of farmland"
      text: 'The Colorado River system that feeds Lake Powell and Lake Mead supplies water to about 40 million people and 5 million acres of farmland.',
      src: ['earthdata-mead'],
    },
  },
  prairies: {
    // nasa-ndvi: "In that year [1993], heavy rain in the Northern Great Plains (North and South Dakota, Alberta, and Saskatchewan) led to flooding in the Missouri River. The resulting exceptionally lush vegetation appears as a positive anomaly"
    // ipcc-wg2 (B.1.3): "related negative impacts were mainly in mid- and low latitude regions but positive impacts occurred in some high latitude regions"
    text: 'Weather here swings hard from year to year: in 1993, heavy rain over Alberta, Saskatchewan and the Dakotas brought floods and unusually lush growth. IPCC notes that climate impacts on farming have even been positive in some high-latitude regions, so a trend here would need careful reading.',
    src: ['nasa-ndvi', 'ipcc-wg2'],
  },
}

export function regionContext(rid?: string): RegionContext | null {
  return (rid && REGIONS[rid]) || null
}

export const IMPACT_REGIONS = Object.keys(REGIONS)

// ------------------------------------------------------------------ how to read the panel

export interface Framing {
  /** What the test can and cannot say. Shown on every panel. */
  scope: string
  /** What the verdict means for reading the impacts. */
  reading: string
  /** Which direction's impacts to show. */
  show: ('rising' | 'falling')[]
  conditional: boolean
}

/**
 * How to read the impacts for one test result. The test says WHETHER the variable changed;
 * the impacts are context from research, and for a result that is not significant they are
 * framed as what would matter if the tendency continued.
 */
export function framing(opts: {
  variable: string
  place: string
  verdict: Verdict
  slope: number
  nYears: number
  yearsNeeded: number | null
}): Framing {
  const { variable, place, verdict, slope, nYears, yearsNeeded } = opts
  const v = variable.toLowerCase()
  const dir: 'rising' | 'falling' = slope >= 0 ? 'rising' : 'falling'
  const scope = `Our test shows whether ${v} changed in ${place}. It cannot say why it changed or what it will do next. The impacts below are context from published research, not a conclusion of the test.`
  if (verdict === 'significant')
    return {
      scope,
      reading: `The test found a ${dir} trend that is unlikely to be chance. Research shows why a change like this matters for people.`,
      show: [dir],
      conditional: false,
    }
  const need = yearsNeeded === null ? null : Math.round(yearsNeeded)
  const more =
    need !== null && need > nYears
      ? ` At the current pace and noise, about ${need} years of data would be needed to tell (we have ${nYears}).`
      : ' The change is small or unsteady next to normal year-to-year swings, so more years of data are needed before calling it.'
  if (verdict === 'not_yet')
    return {
      scope,
      reading: `The ${dir} tendency could still be chance. Read what follows as what would matter if it continues.${more}`,
      show: [dir],
      conditional: true,
    }
  return {
    scope,
    reading: `No clear trend so far. Read what follows as what would matter if ${v} started to rise or fall.${more}`,
    show: slope === 0 ? ['rising', 'falling'] : [dir],
    conditional: true,
  }
}

// ------------------------------------------------------------------ case files (Home)

export interface CaseWhy extends Claim {
  /** The research point a judge should remember. */
  title: string
}

/** Why each Home case file matters. Numbers about our own results are never written here; they come from catalog.json. */
export const CASE_WHY: Record<'amazon' | 'haze' | 'prairies' | 'southwest', CaseWhy> = {
  amazon: {
    title: 'Forest, rain and heat are linked',
    // smith2023: "Here we show reduced precipitation over deforested regions across the tropics."
    // butt2023: "deforestation of the Amazon caused strong warming at distances up to 100 km away from the forest loss."
    // gatti2021: "Southeastern Amazonia, in particular, acts as a net carbon source ... to the atmosphere."
    text: 'Published studies find that tropical forest loss reduces rainfall, that Amazon clearing warms land up to 100 km away, and that south-eastern Amazonia now releases more carbon than it absorbs. Our test cannot say what caused these trends, but together they tell one consistent story.',
    src: ['smith2023', 'butt2023', 'gatti2021'],
  },
  haze: {
    title: 'Same process, opposite trends',
    // wild2009: "anthropogenic contribution through changes in aerosol emissions governed by economic developments and air pollution regulations."
    // zhang2019: PM2.5 decreased "from 61.8 ... to 42.0 µg/m3 ... in 5 y, with dominant contributions from anthropogenic emission abatements."
    // sweerts2019: "PV potential decreased on average by 11–15% between 1960 and 2015"
    // burney2014: "yields in 2010 were up to 36% lower for wheat than they otherwise would have been, absent climate and pollutant emissions trends"
    text: "Research links long-term changes in sunlight at the ground to air pollution and to the rules that limit it. China cut fine-particle pollution sharply after 2013, while haze over the Indo-Gangetic Plain grew. Dimming costs solar power, and pollution has cut Indian wheat yields.",
    src: ['wild2009', 'zhang2019', 'sweerts2019', 'burney2014'],
  },
  prairies: {
    title: 'Absence of proof is not proof of absence',
    // ipcc-wg1 (C.1.1): "decadal variability has both enhanced and masked underlying human-caused long-term changes, and this variability will continue into the future (very high confidence)."
    text: 'IPCC notes that natural decade-to-decade swings have both exaggerated and hidden long-term changes. A "not yet" verdict means keep watching, not "nothing is happening".',
    src: ['ipcc-wg1'],
  },
  southwest: {
    title: 'Two witnesses, one drought',
    // williams2022: "2000–2021 was the driest 22-yr period since at least 800"
    // earthdata-mead: "The river system supplies water to approximately 40 million people and 5 million acres of farmland"
    text: 'Soil-moisture records show 2000–2021 was the driest 22-year stretch in the region since at least the year 800, and in 2026 Lake Mead hit its lowest level since 1937. The Colorado River system supplies water to about 40 million people.',
    src: ['williams2022', 'earthdata-mead'],
  },
}

/** Sources grouped for the Sources page. */
export function sourcesByOrg(): { org: SourceOrg; label: string; items: (Source & { id: SourceId })[] }[] {
  const label: Record<SourceOrg, string> = {
    NASA: 'NASA',
    IPCC: 'IPCC Sixth Assessment Report',
    WHO: 'World Health Organization',
    FAO: 'Food and Agriculture Organization of the UN',
    Paper: 'Peer-reviewed research',
  }
  return (Object.keys(label) as SourceOrg[]).map((org) => ({
    org,
    label: label[org],
    items: SOURCE_IDS.filter((id) => SOURCES[id].org === org).map((id) => ({ id, ...SOURCES[id] })),
  }))
}
