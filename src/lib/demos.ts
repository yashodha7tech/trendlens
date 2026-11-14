import { analyzeSeries, loadRegion } from './data'
import { fmt, pText, rate } from './format'
import { href } from './router'
import { sensitivity, type Analysis } from './stats'
import type { Catalog } from './types'

export interface DemoStep {
  to: string
  text: string
  highlight?: string
  ms?: number
}

export interface Demo {
  id: string
  kicker: string
  title: string
  question: string
  steps: DemoStep[]
}

async function result(region: string, vid: string, from?: number): Promise<Analysis> {
  const data = await loadRegion(region)
  return analyzeSeries(data.series[vid], from)
}

/** Demo scripts. Every number in a caption is computed from the published data when the demo starts. */
export async function buildDemos(cat: Catalog): Promise<Demo[]> {
  const v = cat.variables
  const amT = await result('samazon', 't2m')
  const amP = await result('samazon', 'precip')
  const amTree = await result('samazon', 'tree').catch(() => null)
  const prT = await result('prairies', 't2m')
  const igS = await result('igp', 'sun')
  const ncS = await result('ncp', 'sun')
  const igA = await result('igp', 'aod')
  const ncA = await result('ncp', 'aod')
  const ncSens = sensitivity(ncA.annualYears, ncA.annual)
  const firstSig = ncSens.find((c) => c.significant)
  const amSens = sensitivity(amT.annualYears, amT.annual)
  const amSig = amSens.filter((c) => c.significant).length
  const prSens = sensitivity(prT.annualYears, prT.annual)
  const prSig = prSens.filter((c) => c.significant).length
  const prStations = (await loadRegion('prairies')).stations.t2m
  const r = (a: Analysis, vid: string) => rate(a, v[vid])
  // count the variables that actually have results (cat.variables also lists ones still being downloaded)
  const nAm = Object.keys(cat.results.samazon ?? {}).length
  const nWord = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'][nAm] ?? String(nAm)

  const amazon: Demo = {
    id: 'clear-trend',
    kicker: 'Demo 1 · A clear trend',
    title: 'Is the southern Amazon getting hotter and drier?',
    question: 'Is the southern Amazon getting hotter and drier?',
    steps: [
      {
        to: href(['explore', 'samazon']),
        highlight: '.radar',
        text: `We start with a place and a question. For the southern Amazon, TrendLens scans ${nWord} NASA variables and ranks them by how much they changed compared with their normal year-to-year swings.`,
      },
      {
        to: href(['trend', 'samazon', 't2m']),
        highlight: '.chart',
        text: `Air temperature, 1981–${amT.last}. The grey line is every month with the seasonal cycle removed; each dot is a yearly average. The blue line is the Theil-Sen trend, and the shaded bow-tie is the 95% range of plausible trend lines.`,
      },
      {
        to: href(['trend', 'samazon', 't2m']),
        highlight: '.cards',
        text: `The verdict: ${r(amT, 't2m').perDecade} (95% interval ${r(amT, 't2m').low} to ${r(amT, 't2m').high}), ${pText(amT.mk.p)}. A trend this steady is very unlikely to be chance, so it is marked significant.`,
      },
      {
        to: href(['trend', 'samazon', 't2m']),
        highlight: '#sensitivity',
        text: `A good detective checks whether the answer depends on when you start counting. Each square re-runs the test from a different start year: ${amSig} of ${amSens.length} start years give a significant result. Only the shortest records fall short.`,
      },
      {
        to: href(['trend', 'samazon', 't2m']),
        highlight: '#where',
        text: `Where is it changing? Every square is one MERRA-2 grid cell with its own trend test. Black dots mark cells that stay significant after correcting for testing hundreds of cells at once.`,
      },
      {
        to: href(['trend', 'samazon', 'precip']),
        highlight: '.verdict-line',
        text: `Rainfall tells the other half: ${r(amP, 'precip').perDecade} (${r(amP, 'precip').percent}), ${pText(amP.mk.p)}. Hotter and drier, both significant.`,
      },
      ...(amTree
        ? [
            {
              to: href(['trend', 'samazon', 'tree']),
              highlight: '.verdict-line',
              text: `MODIS tree cover at our sample sites fell by ${r(amTree, 'tree').value.replace('−', '')} percentage points per decade (${pText(amTree.mk.p)}). Forest loss is one process researchers link to local warming and drying, but trends alone can't prove cause and effect.`,
            },
          ]
        : []),
    ],
  }

  const prairies: Demo = {
    id: 'not-yet',
    kicker: 'Demo 2 · Not significant yet',
    title: 'Are the Canadian Prairies warming significantly?',
    question: 'Are the Canadian Prairies warming?',
    steps: [
      {
        to: href(['trend', 'prairies', 't2m']),
        highlight: '.verdict-line',
        text: `Air temperature in the Canadian Prairies is rising by about ${r(prT, 't2m').perDecade}, but ${pText(prT.mk.p)}. We cannot rule out chance, so TrendLens says so instead of overselling it.`,
      },
      {
        to: href(['trend', 'prairies', 't2m'], { view: 'raw' }),
        highlight: '.chart',
        text: `Why? Look at the raw monthly data. Prairie winters swing by many degrees from one year to the next, and that natural noise is large compared with a change of ${r(prT, 't2m').value} °C per decade.`,
      },
      {
        to: href(['trend', 'prairies', 't2m']),
        highlight: '#needed',
        text: `How long would we need? Using the trend size, the noise and its year-to-year memory (Weatherhead et al., 1998), a trend like this needs about ${fmt(prT.yearsNeeded ?? NaN, 0)} years of data to detect. We have ${prT.nYears}.`,
      },
      ...(prStations?.trend
        ? [
            {
              to: href(['trend', 'prairies', 't2m']),
              highlight: '#stations',
              text: `A second opinion from NOAA's Climate Data Online: ${prStations.stations.length} weather stations follow MERRA-2 closely (correlation ${fmt(prStations.r!, 2)}), and they also show no significant trend (${pText(prStations.trend.station.p)}).`,
            },
          ]
        : []),
      {
        to: href(['trend', 'prairies', 't2m']),
        highlight: '#sensitivity',
        text: `${prSig === 0 ? 'No start year' : `Only ${prSig} of ${prSens.length} start years`} gives a significant result. "Not significant" does not mean "no change". It means the evidence isn't strong enough yet, and more years of data may change the verdict.`,
      },
    ],
  }

  const opposite: Demo = {
    id: 'opposite',
    kicker: 'Demo 3 · Opposite directions',
    title: 'Why is sunlight falling over India but rising over China?',
    question: 'Is sunlight at the ground changing over India and China?',
    steps: [
      {
        to: href(['compare', 'sun', 'igp', 'ncp']),
        highlight: '#compare-charts',
        text: `Same variable, same years, two of the haziest places on Earth. Sunlight reaching the ground is falling over India's Gangetic Plain (${r(igS, 'sun').perDecade}) and rising over the North China Plain (${r(ncS, 'sun').perDecade}).`,
      },
      {
        to: href(['compare', 'sun', 'igp', 'ncp']),
        highlight: '#compare-map',
        text: `The map shows the split cell by cell: coral (falling) over India, blue (rising) over China. One variable, opposite directions.`,
      },
      {
        to: href(['compare', 'aod', 'igp', 'ncp']),
        highlight: '#compare-charts',
        text: `One process can explain both: haze. Aerosol optical depth, how much sunlight tiny particles block, is rising over India (${r(igA, 'aod').perDecade}, ${pText(igA.mk.p)}) and falling over China.`,
      },
      {
        to: href(['trend', 'ncp', 'aod']),
        highlight: '#sensitivity',
        text: `China's haze rose and then fell, so a straight line from 2001 is not significant (${pText(ncA.mk.p)}). ${
          firstSig ? `Start in ${firstSig.start} or later and the decline is significant.` : ''
        } That is why TrendLens shows every possible start year, not just one.`,
      },
    ],
  }

  return [amazon, prairies, opposite]
}
