import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { DealerListRow, DealerStatus } from './types'

// Every dealer's location and radius on a street map, plus the pairs whose radii
// overlap. Locations are where routing measures from (dealer_routing.lat/lng: the rooftop
// if one was entered, otherwise the centre of the rooftop ZIP), so what you see here is
// exactly what routing uses.
//
// Colour shows status only (active / testing / inactive); each dealer is named on the map,
// so identity never depends on colour.

const MILE = 1609.344
const COLOR: Record<DealerStatus, string> = { active: '#0d7a52', testing: '#b07800', inactive: '#82948b' }
const STATUS_LABEL: Record<DealerStatus, string> = { active: 'Active', testing: 'Testing', inactive: 'Inactive' }

// Same formula as the backend router (modules/routing/router.js), so distances match.
const milesBetween = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = 3958.8
  const rad = (x: number) => (x * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

type Placed = DealerListRow & { lat: number; lng: number; radius_miles: number }

type Props = {
  dealers: DealerListRow[]
  onOpen: (slug: string) => void
}

export default function DealerMap({ dealers, onOpen }: Props) {
  const [showInactive, setShowInactive] = useState(false)
  const el = useRef<HTMLDivElement | null>(null)
  const map = useRef<L.Map | null>(null)
  const layer = useRef<L.LayerGroup | null>(null)

  const placed = useMemo(
    () =>
      dealers.filter(
        (d): d is Placed => d.lat != null && d.lng != null && d.radius_miles != null && (showInactive || d.status !== 'inactive'),
      ),
    [dealers, showInactive],
  )
  const hiddenInactive = dealers.filter((d) => d.status === 'inactive').length

  // Pairs of dealers whose radii touch, closest first.
  const overlaps = useMemo(() => {
    const out: Array<{ a: Placed; b: Placed; miles: number; inside: Placed[] }> = []
    for (let i = 0; i < placed.length; i += 1) {
      for (let j = i + 1; j < placed.length; j += 1) {
        const a = placed[i]
        const b = placed[j]
        const miles = milesBetween(a, b)
        if (miles < a.radius_miles + b.radius_miles) {
          // whose location sits inside the other's radius
          const inside = [miles <= a.radius_miles ? b : null, miles <= b.radius_miles ? a : null].filter((x): x is Placed => x !== null)
          out.push({ a, b, miles, inside })
        }
      }
    }
    return out.sort((x, y) => x.miles - y.miles)
  }, [placed])

  // The map itself, created once.
  useEffect(() => {
    if (!el.current || map.current) return
    map.current = L.map(el.current, { scrollWheelZoom: false, attributionControl: true }).setView([30.27, -97.74], 9)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map.current)
    layer.current = L.layerGroup().addTo(map.current)
    return () => {
      map.current?.remove()
      map.current = null
    }
  }, [])

  // Circles and pins, redrawn when the dealers or the inactive toggle change.
  useEffect(() => {
    const m = map.current
    const group = layer.current
    if (!m || !group) return
    group.clearLayers()
    const bounds: L.LatLngBounds[] = []
    for (const d of placed) {
      const color = COLOR[d.status]
      const circle = L.circle([d.lat, d.lng], {
        radius: d.radius_miles * MILE,
        color,
        weight: 2,
        opacity: 0.8,
        fillColor: color,
        fillOpacity: 0.1,
        dashArray: d.status === 'active' ? undefined : '6 6',
      })
        .bindTooltip(`${d.name}: ${d.radius_miles} mi radius`, { sticky: true })
        .on('click', () => onOpen(d.slug))
      const pin = L.circleMarker([d.lat, d.lng], { radius: 7, color: '#ffffff', weight: 2, fillColor: color, fillOpacity: 1 })
        .bindTooltip(d.name, { permanent: true, direction: 'right', offset: [10, 0], className: 'map-label' })
        .on('click', () => onOpen(d.slug))
      group.addLayer(circle)
      group.addLayer(pin)
      bounds.push(circle.getBounds())
    }
    if (bounds.length) {
      const all = bounds.reduce((acc, b) => acc.extend(b), L.latLngBounds(bounds[0].getSouthWest(), bounds[0].getNorthEast()))
      m.fitBounds(all, { padding: [24, 24] })
    }
  }, [placed, onOpen])

  return (
    <section className="panel section-card map-card">
      <div className="section-head">
        <div>
          <h2>Map</h2>
          <p className="muted">
            Each dealer’s location and radius, where routing measures from. Click a dealer to open it.
          </p>
        </div>
        <div className="map-legend" aria-label="Legend">
          {(['active', 'testing', 'inactive'] as DealerStatus[])
            .filter((s) => s !== 'inactive' || showInactive)
            .map((s) => (
              <span key={s} className="map-legend-item">
                <span className={`map-swatch map-swatch-${s}`} aria-hidden="true" />
                {STATUS_LABEL[s]}
              </span>
            ))}
          {hiddenInactive ? (
            <label className="map-toggle">
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
              Show inactive ({hiddenInactive})
            </label>
          ) : null}
        </div>
      </div>

      <div ref={el} className="dealer-map" role="region" aria-label="Map of dealer locations and radii" />

      <div className="map-pairs">
        <h3>Where radii overlap</h3>
        {overlaps.length ? (
          <div className="table-wrap">
            <table className="compact">
              <thead>
                <tr>
                  <th>Dealers</th>
                  <th className="num">Apart</th>
                  <th className="num">Radii</th>
                  <th>What it means</th>
                </tr>
              </thead>
              <tbody>
                {overlaps.map(({ a, b, miles, inside }) => (
                  <tr key={`${a.slug}-${b.slug}`}>
                    <td>
                      {a.name} and {b.name}
                    </td>
                    <td className="num">{miles.toFixed(1)} mi</td>
                    <td className="num">
                      {a.radius_miles} + {b.radius_miles} mi
                    </td>
                    <td>
                      {inside.length
                        ? inside.map((x) => `${x.name} is inside ${x === a ? b.name : a.name}’s radius`).join('; ')
                        : `Radii overlap by ${(a.radius_miles + b.radius_miles - miles).toFixed(1)} mi`}
                      .
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">No two dealers’ radii overlap.</p>
        )}
        <p className="muted map-note">
          Overlap alone doesn’t mean two dealers share leads. Routing gives a lead to the dealer in the closest distance band
          (the bands are on the Settings page); dealers only take turns when they land in the same band.
        </p>
      </div>
    </section>
  )
}
