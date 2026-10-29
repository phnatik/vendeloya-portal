import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { apiGet, apiSend, UnauthorizedError } from '../api'
import { loadShapes, type ZipFeature } from './zipShapes'

// A dealer's territory: the ZIP codes it owns. A lead goes to the owner of its ZIP; a ZIP
// owned by several dealers rotates between them (counted per ZIP per month).
//
// The map shows every Texas ZIP (Census 2020 ZIP code tabulation areas, simplified —
// public/geo/tx-zip-shapes.json). Click ZIPs to add or remove them, start from "every ZIP
// within N miles", or type ZIPs in (needed for PO-box and new ZIPs, which have no shape).
// Nothing changes until Save, which records the ZIPs added and removed with a reason.

type Owner = { slug: string; name: string; status: string }
type TerritoryRow = { zip: string; has_location: boolean; owners: Owner[] }
type SaveResult = { changed: boolean; added: string[]; removed: string[]; shared: Array<{ zip: string; with: string[] }>; zip_count: number }

type Props = {
  slug: string
  dealerName: string
  territory: string[]
  home: { lat: number; lng: number } | null
  token: string
  canEdit: boolean
  onSaved: () => void
  onError: (e: unknown) => void
}

const COLOR = {
  mine: '#0d7a52',
  shared: '#b07800',
  other: '#82948b',
  unclaimed: '#9aa9a1',
  added: '#0c4a36',
  removed: '#c71222',
}

const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x))
const parseZips = (text: string) => text.split(/[\s,;]+/).map((z) => z.trim()).filter(Boolean)

export default function TerritoryEditor({ slug, dealerName, territory, home, token, canEdit, onSaved, onError }: Props) {
  const original = useMemo(() => new Set(territory), [territory])
  const [draft, setDraft] = useState<Set<string>>(() => new Set(territory))
  const [others, setOthers] = useState<Map<string, Owner[]>>(new Map())
  const [shapeZips, setShapeZips] = useState<Set<string> | null>(null)
  const [editing, setEditing] = useState(false)
  const [miles, setMiles] = useState('10')
  const [typed, setTyped] = useState('')
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const el = useRef<HTMLDivElement | null>(null)
  const map = useRef<L.Map | null>(null)
  const zipLayer = useRef<L.GeoJSON | null>(null)

  // Expand: a taller map. Leaflet measures its box once, so tell it the box changed.
  const [big, setBig] = useState(false)
  useEffect(() => {
    map.current?.invalidateSize()
  }, [big])
  // The latest state, for Leaflet's event handlers (created once).
  const live = useRef({ draft, others, editing })
  useEffect(() => {
    live.current = { draft, others, editing }
  })

  // A fresh territory from the server (after a save) resets the draft.
  const [shownTerritory, setShownTerritory] = useState(territory)
  if (territory !== shownTerritory) {
    setShownTerritory(territory)
    setDraft(new Set(territory))
  }

  const loadOthers = useCallback(() => {
    apiGet<TerritoryRow[]>('/dealers/territories', token)
      .then((rows) => {
        const m = new Map<string, Owner[]>()
        for (const r of rows) {
          const theirs = r.owners.filter((o) => o.slug !== slug)
          if (theirs.length) m.set(r.zip, theirs)
        }
        setOthers(m)
      })
      .catch(onError)
  }, [token, slug, onError])

  useEffect(loadOthers, [loadOthers])

  const styleFor = useCallback((zip: string): L.PathOptions => {
    const { draft: d, others: o } = live.current
    const mine = d.has(zip)
    const theirs = o.has(zip)
    const wasMine = original.has(zip)
    const fill = mine && theirs ? COLOR.shared : mine ? COLOR.mine : theirs ? COLOR.other : COLOR.unclaimed
    const style: L.PathOptions = {
      color: mine || theirs ? fill : COLOR.unclaimed,
      weight: mine ? 1.5 : 0.6,
      opacity: mine || theirs ? 0.9 : 0.5,
      fillColor: fill,
      fillOpacity: mine ? 0.45 : theirs ? 0.25 : 0.03,
      dashArray: undefined,
    }
    if (mine && !wasMine) Object.assign(style, { color: COLOR.added, weight: 2.5, dashArray: '5 4' })
    if (!mine && wasMine) Object.assign(style, { color: COLOR.removed, weight: 2.5, dashArray: '5 4', fillOpacity: 0.05 })
    return style
  }, [original])

  const toggle = useCallback((zip: string) => {
    setDraft((prev) => {
      const next = new Set(prev)
      if (next.has(zip)) next.delete(zip)
      else next.add(zip)
      return next
    })
  }, [])

  // The map and its ZIP shapes, created once.
  useEffect(() => {
    if (!el.current || map.current) return
    const m = L.map(el.current, { scrollWheelZoom: true, wheelPxPerZoomLevel: 120, preferCanvas: true })
    map.current = m
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(m)
    m.setView(home ? [home.lat, home.lng] : [30.27, -97.74], 10)
    if (home) {
      L.circleMarker([home.lat, home.lng], { radius: 7, color: '#ffffff', weight: 2, fillColor: COLOR.added, fillOpacity: 1 })
        .bindTooltip(dealerName, { permanent: true, direction: 'right', offset: [10, 0], className: 'map-label' })
        .addTo(m)
    }

    let cancelled = false
    loadShapes()
      .then((fc) => {
        if (cancelled) return
        setShapeZips(new Set(fc.features.map((f) => f.properties.zip)))
        zipLayer.current = L.geoJSON(fc, {
          style: (f) => styleFor((f as ZipFeature).properties.zip),
          onEachFeature: (f, layer) => {
            const zip = (f as ZipFeature).properties.zip
            layer.bindTooltip(() => {
              const { draft: d, others: o } = live.current
              const owners = [...(d.has(zip) ? [dealerName] : []), ...(o.get(zip) ?? []).map((x) => x.name)]
              return `<strong>${zip}</strong><br>${owners.length ? owners.join(', ') : 'Nobody'}${owners.length > 1 ? ' (rotates)' : ''}`
            }, { sticky: true })
            layer.on('click', () => {
              if (live.current.editing) toggle(zip)
            })
          },
        }).addTo(m)
        // Start framed on the territory, if there is one.
        const owned = L.featureGroup()
        zipLayer.current.eachLayer((l) => {
          const zip = ((l as L.GeoJSON).feature as ZipFeature).properties.zip
          if (live.current.draft.has(zip)) owned.addLayer(l)
        })
        if (owned.getLayers().length) m.fitBounds(owned.getBounds(), { padding: [30, 30], maxZoom: 11 })
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load the ZIP map.'))

    return () => {
      cancelled = true
      m.remove()
      map.current = null
      zipLayer.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- built once; later changes restyle below
  }, [])

  // Repaint when the draft or the other dealers' territories change.
  useEffect(() => {
    zipLayer.current?.eachLayer((l) => {
      const zip = ((l as L.GeoJSON).feature as ZipFeature).properties.zip
      ;(l as L.Path).setStyle(styleFor(zip))
    })
  }, [draft, others, styleFor])

  const added = [...draft].filter((z) => !original.has(z)).sort()
  const removed = [...original].filter((z) => !draft.has(z)).sort()
  const dirty = !sameSet(draft, original)
  const sharedNow = [...draft].filter((z) => others.has(z)).sort()

  const addNear = async () => {
    setError('')
    setMessage('')
    try {
      const rows = await apiGet<Array<{ zip: string; miles: number }>>(`/dealers/${slug}/zips-near?miles=${encodeURIComponent(miles)}`, token)
      setDraft((prev) => new Set([...prev, ...rows.map((r) => r.zip)]))
      setMessage(`Added ${rows.length} ZIPs within ${miles} miles. Click any to remove them, then Save.`)
    } catch (e) {
      if (e instanceof UnauthorizedError) onError(e)
      else setError(e instanceof Error ? e.message : 'Could not find nearby ZIPs.')
    }
  }

  const addTyped = (event: FormEvent) => {
    event.preventDefault()
    const zips = parseZips(typed)
    const badOnes = zips.filter((z) => !/^\d{5}$/.test(z))
    if (badOnes.length) {
      setError(`Not a 5-digit ZIP: ${badOnes.join(', ')}`)
      return
    }
    setError('')
    setDraft((prev) => new Set([...prev, ...zips]))
    setTyped('')
  }

  const discard = () => {
    setDraft(new Set(original))
    setEditing(false)
    setReason('')
    setError('')
    setMessage('')
  }

  const save = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const r = await apiSend<SaveResult>('PATCH', `/dealers/${slug}/territory`, token, { add: added, remove: removed, reason })
      const shared = r.shared.length ? ` Now shared: ${r.shared.map((s) => `${s.zip} with ${s.with.join(', ')}`).join('; ')} — leads from those ZIPs rotate.` : ''
      setMessage(`Saved: ${r.added.length} added, ${r.removed.length} removed. ${dealerName} now has ${r.zip_count} ZIPs.${shared}`)
      setEditing(false)
      setReason('')
      loadOthers()
      onSaved()
    } catch (e) {
      if (e instanceof UnauthorizedError) onError(e)
      else setError(e instanceof Error ? e.message : 'Could not save the territory.')
    } finally {
      setBusy(false)
    }
  }

  const sortedDraft = [...draft].sort()

  return (
    <section className="panel section-card map-card territory-card">
      <div className="section-head">
        <div>
          <h2>Territory</h2>
          <p className="muted">
            {draft.size
              ? `${dealerName} gets leads from ${original.size} ZIP${original.size === 1 ? '' : 's'}.`
              : `${dealerName} has no ZIPs yet, so routing sends it nothing except repeat customers.`}{' '}
            {editing ? 'Click ZIPs on the map to add or remove them.' : canEdit ? 'Click Edit territory to change it.' : ''}
          </p>
        </div>
        <div className="map-legend" aria-label="Legend">
          <span className="map-legend-item"><span className="map-swatch" style={{ color: COLOR.mine, background: 'rgba(13,122,82,.45)' }} aria-hidden="true" />This dealer</span>
          <span className="map-legend-item"><span className="map-swatch" style={{ color: COLOR.shared, background: 'rgba(176,120,0,.45)' }} aria-hidden="true" />Shared (rotates)</span>
          <span className="map-legend-item"><span className="map-swatch" style={{ color: COLOR.other, background: 'rgba(130,148,139,.25)' }} aria-hidden="true" />Another dealer’s</span>
          <button type="button" className="btn btn-quiet" aria-pressed={big} onClick={() => setBig((v) => !v)}>
            {big ? 'Shrink map' : 'Expand map'}
          </button>
          {canEdit && !editing ? (
            <button type="button" className="btn btn-secondary" onClick={() => { setEditing(true); setMessage('') }}>
              Edit territory
            </button>
          ) : null}
        </div>
      </div>

      {editing ? (
        <div className="territory-tools">
          <div className="inline-form">
            <label>
              <span>Every ZIP within</span>
              <input type="number" min="1" max="100" value={miles} onChange={(e) => setMiles(e.target.value)} />
            </label>
            <button type="button" className="btn btn-secondary" onClick={addNear} disabled={!home}>
              Add ZIPs within {miles || '…'} miles
            </button>
          </div>
          <form className="inline-form" onSubmit={addTyped}>
            <label>
              <span>Type ZIPs (for PO-box or new ZIPs not on the map)</span>
              <input type="text" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="e.g. 78767, 78768" />
            </label>
            <button type="submit" className="btn btn-secondary" disabled={!typed.trim()}>
              Add
            </button>
          </form>
        </div>
      ) : null}

      <div className={`dealer-map territory-map${big ? ' map-big' : ''}`}>
        <div ref={el} className="map-fill" role="region" aria-label={`Map of ${dealerName}’s ZIP codes`} />
      </div>

      {sortedDraft.length ? (
        <div className="zip-chips" aria-label="ZIPs in this territory">
          {sortedDraft.map((z) => {
            const isNew = !original.has(z)
            const noShape = shapeZips !== null && !shapeZips.has(z)
            const shared = others.get(z)
            return (
              <span key={z} className={`zip-chip${isNew ? ' zip-chip-new' : ''}${shared ? ' zip-chip-shared' : ''}`} title={shared ? `Shared with ${shared.map((s) => s.name).join(', ')}` : undefined}>
                {z}
                {noShape ? <span className="muted"> · not on map</span> : null}
                {editing ? (
                  <button type="button" className="zip-chip-x" aria-label={`Remove ${z}`} onClick={() => toggle(z)}>
                    ×
                  </button>
                ) : null}
              </span>
            )
          })}
        </div>
      ) : null}

      {editing && dirty ? (
        <form className="confirm" onSubmit={save}>
          <p>
            <strong>{added.length} to add, {removed.length} to remove.</strong>{' '}
            {added.length ? `Adding ${added.join(', ')}. ` : ''}
            {removed.length ? `Removing ${removed.join(', ')}. ` : ''}
            {sharedNow.length
              ? `Shared with another dealer (leads rotate): ${sharedNow.map((z) => `${z} (${others.get(z)!.map((o) => o.name).join(', ')})`).join(', ')}.`
              : ''}
          </p>
          <label>
            <span>Reason (saved in the activity log)</span>
            <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. territory agreed with Joseph" />
          </label>
          {error ? <p className="error form-error">{error}</p> : null}
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save territory'}
            </button>
            <button type="button" className="btn btn-quiet" onClick={discard} disabled={busy}>
              Discard changes
            </button>
          </div>
        </form>
      ) : editing ? (
        <div className="form-actions">
          <button type="button" className="btn btn-quiet" onClick={discard}>
            Done
          </button>
        </div>
      ) : null}

      {!editing || !dirty ? (error ? <p className="error form-error">{error}</p> : null) : null}
      {message ? <p className="muted">{message}</p> : null}
    </section>
  )
}
