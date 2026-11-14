export type TopicId = 'heat' | 'water' | 'vegetation' | 'air'

export interface VariableMeta {
  name: string
  short: string
  topic: TopicId
  unit: string
  decimals: number
  definition: string
  source: string
  instrument: string
  start: number
  land_only: boolean
  agg: 'mean' | 'annual'
  /** General, non-causal note on what can push this variable in opposite directions in two regions. */
  contrast?: string
  /** Chart value-axis label when the unit alone is ambiguous ("% of sky" rather than "% of ground"). */
  axis?: string
}

export interface RegionMeta {
  name: string
  country: string
  bbox: [number, number, number, number] // lat0, lat1, lon0, lon1
  biome: string
  why: string
  center: [number, number]
  land_cells: number
}

export interface Summary {
  first: number
  last: number
  n_years: number
  coverage: number
  mean: number
  slope: number
  low: number
  high: number
  p: number
  t_p: number
  snr: number
  years_needed: number | null
  verdict: 'significant' | 'not_yet' | 'none'
  per_year: 12 | 1
}

export interface Catalog {
  generated: string
  end_year: number
  topics: Record<TopicId, string>
  variables: Record<string, VariableMeta>
  regions: Record<string, RegionMeta>
  results: Record<string, Record<string, Summary>>
}

export interface SeriesJSON {
  start: number
  per_year: 12 | 1
  values: (number | null)[]
}

/** [lat, lon, slope per decade, p, significant after FDR, (site mean)] */
export type MapCell = [number, number, number, number, boolean, number?]

export interface MapJSON {
  kind: 'grid' | 'sites'
  dlat?: number
  dlon?: number
  km?: number
  cells: MapCell[]
  n_sig: number
  n_sig_raw: number
}

export interface StationTrend {
  slope: number
  low: number
  high: number
  p: number
}

export interface StationJSON {
  stations: { id: string; name: string; lat: number; lon: number; coverage: number }[]
  note?: string
  years?: number[]
  station?: number[]
  merra2?: number[]
  trend?: { station: StationTrend; merra2: StationTrend }
  r?: number
  same_direction?: boolean
  both_significant?: boolean
}

export interface RegionJSON {
  id: string
  series: Record<string, SeriesJSON>
  maps: Record<string, MapJSON>
  stations: Record<string, StationJSON>
}

/** A place under investigation: a featured region or any point on Earth. */
export interface Place {
  id: string
  kind: 'region' | 'point'
  name: string
  subtitle: string
  lat: number
  lon: number
  bbox?: [number, number, number, number]
  region?: RegionMeta
  series: Record<string, SeriesJSON>
  maps: Record<string, MapJSON>
  stations: Record<string, StationJSON>
  missing?: Record<string, string>
}
