import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { apiGet } from '../api'
import { loadShapes, type ZipFeature } from './zipShapes'
import type { DealerListRow, DealerStatus } from './types'

// Every dealer's territory on one map: each store's ZIPs in its own colour, shared ZIPs
// (leads from them rotate) in grey with a dashed edge, and each store's location. Below
// it, the shared ZIPs listed out. Dealers are also named on their pins, in the legend and
// in each ZIP's tooltip, so identity never depends on colour alone.

type Owner = { slug: string; name: string; status: DealerStatus }
type TerritoryRow = { zip: string; has_location: boolean; owners: Owner[] }

// Categorical colours in fixed order (colour-blind checked), light values because the map
// tiles are light in either theme. A store's colour comes from its place in creation order
// (dealer id), so it never changes when other stores are added, hidden or filtered. Past
// eight stores the rest share OTHER; the pins and tooltips still name them.
const PALETTE = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948']
const OTHER = '#5f6f68'
const SHARED = { fill: '#9aa9a1', edge: '#3d4a44' }

type Props = {
  dealers: DealerListRow[]
  token: string
  onOpen: (slug: string) => void
  onError: (e: unknown) => void
}

export default function DealerMap({ dealers, token, onOpen, onError }: Props) {
  const [showInactive, setShowInactive] = useState(false)
  const [rows, setRows] = useState<TerritoryRow[]>([])
  const el = useRef<HTMLDivElement | null>(null)
  const map = useRef<L.Map | null>(null)
  const zipLayer = useRef<L.GeoJSON | null>(null)
  const pins = useRef<L.LayerGroup | null>(null)

  // Expand: a taller map. Leaflet measures its box once, so tell it the box changed.
  const [big, setBig] = useState(false)
  useEffect(() => {
    map.current?.invalidateSize()
  }, [big])

  useEffect(() => {
    let live = true
    apiGet<TerritoryRow[]>('/dealers/territories', token)
      .then((r) => live && setRows(r))
      .catch((e) => live && onError(e))
    return () => {
      live = false
    }
  }, [token, dealers, onError])

  // ZIP -> owners shown (inactive dealers hidden unless asked for).
  const owners = useMemo(() => {
    const m = new Map<string, Owner[]>()
    for (const r of rows) {
      const shown = r.owners.filter((o) => showInactive || o.status !== 'inactive')
      if (shown.length) m.set(r.zip, shown)
    }
    return m
  }, [rows, showInactive])
  const shared = useMemo(() => [...owners.entries()].filter(([, o]) => o.length > 1).sort(([a], [b]) => a.localeCompare(b)), [owners])
  const offMap = rows.filter((r) => !r.has_location)
  const hiddenInactive = dealers.filter((d) => d.status === 'inactive').length
  const colorOf = useMemo(() => {
    const byId = [...dealers].sort((a, b) => a.id - b.id)
    return new Map(byId.map((d, i) => [d.slug, PALETTE[i] ?? OTHER]))
  }, [dealers])
  const legendDealers = [...dealers].sort((a, b) => a.id - b.id).filter((d) => showInactive || d.status !== 'inactive')

  const latest = useRef({ owners, colorOf })
  useEffect(() => {
    latest.current = { owners, colorOf }
  }, [owners, colorOf])

  const styleFor = (zip: string): L.PathOptions => {
    const o = latest.current.owners.get(zip)
    if (!o) return { stroke: false, fillOpacity: 0, interactive: false } as L.PathOptions
    if (o.length > 1) return { color: SHARED.edge, weight: 1.5, opacity: 0.9, dashArray: '4 3', fillColor: SHARED.fill, fillOpacity: 0.55 }
    const color = latest.current.colorOf.get(o[0].slug) ?? OTHER
    return { color, weight: 1, opacity: 0.8, dashArray: undefined, fillColor: color, fillOpacity: 0.4 }
  }

  // Frame every owned ZIP, or failing that every store.
  const fit = () => {
    const m = map.current
    if (!m) return
    const owned = L.featureGroup()
    zipLayer.current?.eachLayer((l) => {
      if (latest.current.owners.has(((l as L.GeoJSON).feature as ZipFeature).properties.zip)) owned.addLayer(l)
    })
    pins.current?.eachLayer((l) => owned.addLayer(L.marker((l as L.CircleMarker).getLatLng())))
    if (owned.getLayers().length) m.fitBounds(owned.getBounds(), { padding: [24, 24], maxZoom: 11 })
  }

  // The map, created once; ZIP shapes added when loaded.
  useEffect(() => {
    if (!el.current || map.current) return
    const m = L.map(el.current, { scrollWheelZoom: true, wheelPxPerZoomLevel: 120, preferCanvas: true }).setView([30.27, -97.74], 9)
    map.current = m
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(m)
    pins.current = L.layerGroup().addTo(m)
    let cancelled = false
    loadShapes()
      .then((fc) => {
        if (cancelled) return
        zipLayer.current = L.geoJSON(fc, {
          style: (f) => styleFor((f as ZipFeature).properties.zip),
          onEachFeature: (f, layer) => {
            const zip = (f as ZipFeature).properties.zip
            layer.bindTooltip(() => {
              const o = latest.current.owners.get(zip) ?? []
              return `<strong>${zip}</strong><br>${o.map((x) => x.name).join(', ')}${o.length > 1 ? ' (rotates)' : ''}`
            }, { sticky: true })
            layer.on('click', () => {
              const o = latest.current.owners.get(zip)
              if (o && o.length === 1) onOpen(o[0].slug)
            })
          },
        }).addTo(m)
        fit()
      })
      .catch((e) => onError(e))
    return () => {
      cancelled = true
      m.remove()
      map.current = null
      zipLayer.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- built once; later changes restyle below
  }, [])

  // Repaint ZIPs and redraw store pins when the data or the toggle changes.
  useEffect(() => {
    zipLayer.current?.eachLayer((l) => (l as L.Path).setStyle(styleFor(((l as L.GeoJSON).feature as ZipFeature).properties.zip)))
    const group = pins.current
    if (group) {
      group.clearLayers()
      for (const d of dealers) {
        if (d.lat == null || d.lng == null || (!showInactive && d.status === 'inactive')) continue
        L.circleMarker([d.lat, d.lng], { radius: 8, color: '#ffffff', weight: 2.5, fillColor: colorOf.get(d.slug) ?? OTHER, fillOpacity: 1 })
          .bindTooltip(`${d.name} · ${d.zip_count} ZIPs${d.status === 'active' ? '' : ` (${d.status})`}`, { permanent: true, direction: 'right', offset: [10, 0], className: 'map-label' })
          .on('click', () => onOpen(d.slug))
          .addTo(group)
      }
    }
    fit()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- styleFor/fit read refs
  }, [owners, dealers, showInactive, colorOf])

  return (
    <section className="panel section-card map-card">
      <div className="section-head">
        <div>
          <h2>Territories</h2>
          <p className="muted">Which ZIP codes each dealer gets leads from. Hover a ZIP to see its owners; click a dealer to open it. Scroll to zoom.</p>
        </div>
        <div className="map-legend" aria-label="Legend">
          {legendDealers.map((d) => (
            <span key={d.slug} className="map-legend-item">
              <span className="map-swatch" style={{ color: colorOf.get(d.slug) ?? OTHER, background: colorOf.get(d.slug) ?? OTHER }} aria-hidden="true" />
              {d.name}
            </span>
          ))}
          <span className="map-legend-item"><span className="map-swatch" style={{ color: SHARED.edge, background: SHARED.fill, borderStyle: 'dashed' }} aria-hidden="true" />Shared (rotates)</span>
          {hiddenInactive ? (
            <label className="map-toggle">
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
              Include inactive ({hiddenInactive})
            </label>
          ) : null}
          <button type="button" className="btn btn-secondary" aria-pressed={big} onClick={() => setBig((v) => !v)}>
            {big ? 'Shrink map' : 'Expand map'}
          </button>
        </div>
      </div>

      <div className={`dealer-map${big ? ' map-big' : ''}`}>
        <div ref={el} className="map-fill" role="region" aria-label="Map of dealer territories" />
      </div>

      <div className="map-pairs">
        <h3>Shared ZIPs</h3>
        {shared.length ? (
          <div className="table-wrap">
            <table className="compact">
              <thead>
                <tr>
                  <th>ZIP</th>
                  <th>Dealers (leads rotate between them)</th>
                </tr>
              </thead>
              <tbody>
                {shared.map(([zip, o]) => (
                  <tr key={zip}>
                    <td>{zip}</td>
                    <td>{o.map((x) => x.name).join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">No ZIP belongs to more than one dealer.</p>
        )}
        {offMap.length ? (
          <p className="muted map-note">
            Owned but not on the map (PO-box or new ZIPs): {offMap.map((r) => `${r.zip} (${r.owners.map((o) => o.name).join(', ')})`).join('; ')}.
          </p>
        ) : null}
        <p className="muted map-note">
          A lead goes to the dealer that owns its ZIP. A shared ZIP rotates between its owners, counted per ZIP per month. A ZIP nobody owns is left unassigned.
        </p>
      </div>
    </section>
  )
}
