// Texas ZIP shapes for the territory maps: Census 2020 ZIP code tabulation areas
// (cb_2020_us_zcta520_500k), Texas ZIPs only (75–79xxx, 733xx, 885xx), simplified with
// mapshaper to ~10% of points. Public domain. Loaded once per session and shared.
export type ZipShapes = GeoJSON.FeatureCollection<GeoJSON.Geometry, { zip: string }>
export type ZipFeature = GeoJSON.Feature<GeoJSON.Geometry, { zip: string }>

let shapes: Promise<ZipShapes> | null = null
export const loadShapes = (): Promise<ZipShapes> =>
  (shapes ??= fetch(`${import.meta.env.BASE_URL}geo/tx-zip-shapes.json`).then((r) => {
    if (!r.ok) throw new Error('Could not load the ZIP map.')
    return r.json() as Promise<ZipShapes>
  }))
