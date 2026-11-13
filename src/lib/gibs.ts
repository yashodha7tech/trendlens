import L from 'leaflet'

/** NASA Global Imagery Browse Services (GIBS) layers, Web Mercator WMTS. */
const GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best'
export const GIBS_ATTR = 'Imagery: <a href="https://earthdata.nasa.gov/gibs" target="_blank" rel="noreferrer">NASA GIBS</a>'
const EMPTY = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

/** Blue Marble relief. Muted with layer opacity over the map background (no CSS filters). */
export function reliefLayer(opacity = 1) {
  return L.tileLayer(`${GIBS}/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg`, {
    maxNativeZoom: 8,
    maxZoom: 11,
    attribution: `${GIBS_ATTR} · Blue Marble`,
    opacity,
    crossOrigin: 'anonymous',
  })
}

/** MODIS Terra true colour from a few days ago (near-real-time imagery). */
export function modisLayer(daysAgo = 2) {
  const d = new Date(Date.now() - daysAgo * 86400_000).toISOString().slice(0, 10)
  return {
    date: d,
    layer: L.tileLayer(`${GIBS}/MODIS_Terra_CorrectedReflectance_TrueColor/default/${d}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`, {
      maxNativeZoom: 9,
      maxZoom: 11,
      attribution: `${GIBS_ATTR} · MODIS Terra ${d}`,
      crossOrigin: 'anonymous',
    }),
  }
}

function hasChunk(b: Uint8Array, name: string): boolean {
  let i = 8
  while (i + 8 <= b.length) {
    const n = ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0
    const t = String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7])
    if (t === name) return true
    if (t === 'IDAT') return false // transparency chunks must come before the image data
    i += 12 + n
  }
  return false
}

/**
 * Where an overlay has no features, GIBS returns an opaque black palette PNG.
 * This layer fetches each tile and leaves those placeholders transparent.
 */
const OverlayTileLayer = L.TileLayer.extend({
  createTile(this: L.TileLayer, coords: L.Coords, done: L.DoneCallback) {
    const img = document.createElement('img')
    img.alt = ''
    img.setAttribute('role', 'presentation')
    // GIBS sometimes answers 500 instead of its empty placeholder; either way the tile stays transparent
    fetch(this.getTileUrl(coords), { mode: 'cors' })
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((buf) => {
        const b = new Uint8Array(buf)
        const png = b[0] === 0x89 && b[1] === 0x50
        if (!png || (b[25] === 3 && !hasChunk(b, 'tRNS'))) {
          img.src = EMPTY
          done(undefined, img)
          return
        }
        const url = URL.createObjectURL(new Blob([buf], { type: 'image/png' }))
        img.onload = () => {
          URL.revokeObjectURL(url)
          done(undefined, img)
        }
        img.onerror = () => done(new Error('tile'), img)
        img.src = url
      })
      .catch(() => {
        img.src = EMPTY
        done(undefined, img)
      })
    return img
  },
}) as unknown as new (url: string, options?: L.TileLayerOptions) => L.TileLayer

/** Country borders and coastlines drawn above the data. */
export function referenceLayers(pane: string) {
  // the layer has no features below zoom 3, so don't request those tiles at all
  return [new OverlayTileLayer(`${GIBS}/Reference_Features_15m/default/GoogleMapsCompatible_Level13/{z}/{y}/{x}.png`, { minZoom: 3, maxNativeZoom: 13, maxZoom: 13, pane })]
}

export const bboxBounds = (b: [number, number, number, number]) => L.latLngBounds([b[0], b[2]], [b[1], b[3]])
